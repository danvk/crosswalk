/** Type-safe wrapper around Express router for REST APIs */

import Ajv from 'ajv';
import express from 'express';

import {Endpoint} from './api-spec';
import { ExtractRouteParams, HTTPVerb, SafeKey } from './utils';

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

type AnyEndpoint = Endpoint<any, any>;

export class TypedRouter<API> {
  router: express.Router;
  apiSchema?: any;
  ajv?: Ajv.Ajv;

  constructor(router: express.Router, apiSchema?: any) {
    this.router = router;
    if (apiSchema) {
      this.apiSchema = apiSchema;
      this.ajv = new Ajv({allErrors: true});
      this.ajv.addSchema(apiSchema);
    }
  }

  get<
    Path extends keyof API,
    Spec extends SafeKey<API[Path], 'get'> = SafeKey<API[Path], 'get'>
  >(
    route: Path,
    handler: (
      params: Spec extends AnyEndpoint ? ExtractRouteParams<Path & string> : never,
      request: express.Request,
      response: express.Response,
    ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>
  ) {
    // TODO: fill in with a more streamlined implementation?
    this.registerEndpoint('get' as any, route, (params, _, request, response) => handler(params, request, response));
  }

  /** Register a handler on the router for the given path and verb */
  registerEndpoint<
    Path extends keyof API,
    Method extends keyof API[Path] & HTTPVerb,
    Spec extends API[Path][Method] = API[Path][Method]
  >(
    method: Method,
    route: Path,
    handler: (
      params: Spec extends AnyEndpoint ? ExtractRouteParams<Path & string> : never,
      body: Spec extends AnyEndpoint ? Spec['request'] : never,
      request: express.Request,
      response: express.Response,
    ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>,
  ) {
    const {apiSchema} = this;
    let validate: Ajv.ValidateFunction | undefined;
    if (apiSchema) {
      const apiDef = apiSchema.properties as any;
      if (!apiDef[route]) {
        throw new Error(`API JSONSchema is missing entry for ${route}`);
      }
      const refSchema: string = apiDef[route].properties[method].$ref;
      const endpoint = refSchema.slice('#/definitions/'.length);
      const endpointTypes = (apiSchema.definitions as any)[endpoint].properties;
      let requestType = endpointTypes.request;
      if (requestType.$ref) {
        requestType = requestType.$ref; // allow either references or inline types
      } else if (requestType.type && requestType.type === 'null') {
        requestType = null; // no request body, no validation
      } else if (requestType.allOf) {
        // TODO(danvk): figure out how to make ajv understand these.
        throw new Error('Intersection types in APIs are not supported yet.');
      }

      if (requestType && this.ajv) {
        if (typeof requestType === 'string') {
          validate = this.ajv.getSchema(requestType);
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
    }

    this.router[method](route as any, (...[req, response, next]: RequestParams) => {
      const {body} = req;

      if (validate && !validate(body)) {
        return response.status(400).json({
          error: this.ajv!.errorsText(validate.errors),
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

  checkComplete() {
    // TODO: check that all methods in this.apiSchema are implemented.
  }
}
