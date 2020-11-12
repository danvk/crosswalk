import Ajv from 'ajv';
import express from 'express';

import {API, Endpoint} from './api';
import jsonSchema from './api.schema.json';

/** Throw this in a handler to produce an HTTP error response */
export class HTTPError extends Error {
  code: number;
  message: string;

  constructor(code: number, message = '') {
    super(`${code} ${message}`);
    this.code = code;
    this.message = message;
  }
}

type RequestParams = Parameters<express.RequestHandler>;

const ajv = new Ajv({allErrors: true});
ajv.addSchema(jsonSchema);

type AnyEndpoint = Endpoint<any, any, any>;
type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

/** Register a handler on the router for the given path and verb */
export function registerEndpoint<
  Path extends keyof API,
  Method extends keyof API[Path] & HTTPVerb,
  Spec extends API[Path][Method] = API[Path][Method]
>(
  router: express.Router,
  method: Method,
  route: Path,
  handler: (
    params: Spec extends AnyEndpoint ? Spec['params'] : never,
    body: Spec extends AnyEndpoint ? Spec['request'] : never,
    request: express.Request,
    response: express.Response,
  ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>,
) {
  const apiDef = jsonSchema.properties as any;
  if (!apiDef[route]) {
    throw new Error(`API JSONSchema is missing entry for ${route}`);
  }
  const refSchema: string = apiDef[route].properties[method].$ref;
  const endpoint = refSchema.slice('#/definitions/'.length);
  const endpointTypes = (jsonSchema.definitions as any)[endpoint].properties;
  let requestType = endpointTypes.request;
  if (requestType.$ref) {
    requestType = requestType.$ref; // allow either references or inline types
  } else if (requestType.type && requestType.type === 'null') {
    requestType = null; // no request body, no validation
  } else if (requestType.allOf) {
    // TODO(danvk): figure out how to make ajv understand these.
    throw new Error('Intersection types in APIs are not supported yet.');
  }

  let validate: Ajv.ValidateFunction | undefined;
  if (requestType) {
    if (typeof requestType === 'string') {
      validate = ajv.getSchema(requestType);
    } else {
      // Create a new AJV validate for inline object types.
      // This assumes these will never reference other type definitions.
      const requestAjv = new Ajv();
      validate = requestAjv.compile(requestType);
    }
    if (!validate) {
      throw new Error(`Unable to get schema for '${requestType}'`);
    }
  }

  router[method](route, (...[req, response, next]: RequestParams) => {
    const {body} = req;

    if (validate && !validate(body)) {
      return response.status(400).json({
        error: ajv.errorsText(validate.errors),
        errors: validate.errors,
        invalidRequest: body,
      });
    }

    if (req.app.get('env') === 'development') {
      // eslint-disable-next-line no-console
      console.debug(method, route, 'params=', req.params, 'body=', body);
    }

    handler(req.params as any, body, req, response)
      .then(responseObject => {
        if (responseObject === null) {
          // nothing to do. This can happen if the response redirected, say.
        } else if (typeof responseObject === 'string') {
          response.status(200).send(responseObject);
        } else {
          // Allow handlers to send a response other than 200 if they prefer (e.g. 201).
          if (!response.statusCode) {
            response.status(200);
          }
          response.json(responseObject);
        }
      })
      .catch((error: any) => {
        if (error instanceof HTTPError) {
          response.status(error.code).json({error: error.message});
        } else {
          next(error);
        }
      });
  });
}
