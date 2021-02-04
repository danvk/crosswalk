/** Type-safe wrapper around Express router for REST APIs */

import Ajv from 'ajv';
import {STATUS_CODES} from 'http';
import express from 'express';

import {Endpoint, HTTPVerb} from './api-spec';
import {ExtractRouteParams, PathsForMethod, SafeKey} from './utils';

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

type ExpressRequest<Path extends string, Spec> = unknown &
  express.Request<
    ExtractRouteParams<Path>,
    SafeKey<Spec, 'response'>,
    SafeKey<Spec, 'request'>
  >;

type ExpressResponse<Spec> = unknown & express.Response<SafeKey<Spec, 'response'>>;

const registerWithBody = <Method extends HTTPVerb, API>(
  method: Method,
  router: TypedRouter<API>,
) => <
  Path extends PathsForMethod<API, Method>,
  Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>
>(
  route: Path,
  handler: (
    params: ExtractRouteParams<Path>,
    body: SafeKey<Spec, 'request'>,
    request: ExpressRequest<Path, Spec>,
    response: ExpressResponse<Spec>,
  ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>,
) => {
  router.registerEndpoint(method, route as any, handler as any);
};

const registerWithoutBody = <Method extends HTTPVerb, API>(
  method: Method,
  router: TypedRouter<API>,
) => <
  Path extends PathsForMethod<API, Method>,
  Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>
>(
  route: Path,
  handler: (
    params: ExtractRouteParams<Path>,
    request: ExpressRequest<Path, Spec>,
    response: ExpressResponse<Spec>,
  ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>,
) => {
  router.registerEndpoint(method, route as any, (params, _, request, response) =>
    handler(params as any, request as any, response as any),
  );
};

export class TypedRouter<API> {
  router: express.Router;
  apiSchema?: any;
  ajv?: Ajv.Ajv;
  registrations: {path: string; method: HTTPVerb}[];

  constructor(router: express.Router, apiSchema?: any) {
    this.router = router;
    if (apiSchema) {
      this.apiSchema = apiSchema;
      this.ajv = new Ajv({allErrors: true});
      this.ajv.addSchema(apiSchema);
    }
    this.registrations = [];
  }

  // TODO(danvk): consider replacing get() with a streamlined implementation
  get = registerWithoutBody<'get', API>('get', this);
  delete = registerWithoutBody<'delete', API>('delete', this);

  post = registerWithBody<'post', API>('post', this);
  patch = registerWithBody<'patch', API>('patch', this);
  put = registerWithBody<'put', API>('put', this);

  /** Register a handler on the router for the given path and verb */
  registerEndpoint<
    Method extends HTTPVerb,
    Path extends PathsForMethod<API, Method>,
    Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>
  >(
    method: Method,
    route: Path,
    handler: (
      params: ExtractRouteParams<Path>,
      body: SafeKey<Spec, 'request'>,
      request: ExpressRequest<Path, Spec>,
      response: ExpressResponse<Spec>,
    ) => Promise<Spec extends AnyEndpoint ? Spec['response'] : never>,
  ) {
    const validate = this.getValidator(route, method);
    this.registrations.push({path: route as string, method});

    this.router[method](route as any, (...[req, response, next]: RequestParams) => {
      const {body} = req;

      if (validate && !validate(body)) {
        return response.status(400).json({
          error: this.ajv!.errorsText(validate.errors),
          errors: validate.errors,
          invalidRequest: body,
        });
      }

      if (req.app.get('env') === 'test') {
        // eslint-disable-next-line no-console
        console.debug(method, route, 'params=', req.params, 'body=', body);
      }

      handler(req.params as any, body, req as any, response)
        .then(responseObject => {
          if (responseObject === null) {
            // nothing to do. This can happen if the response redirected, say.
          } else if (typeof responseObject === 'string') {
            response.status(200).send(responseObject);
          } else {
            response.json(responseObject);
          }
        })
        .catch((error: any) => {
          // With target below ES2015, instanceof doesn't work here.
          if (error instanceof HTTPError || (error.code && STATUS_CODES[error.code])) {
            response.status(error.code).json({error: error.message});
          } else {
            next(error);
          }
        });
    });
  }

  /** Get a validation function for request bodies for the endpoint, or null if not applicable. */
  getValidator(route: string, method: HTTPVerb): Ajv.ValidateFunction | null {
    const {apiSchema} = this;
    if (!apiSchema) {
      return null;
    }

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
      let validate;
      if (typeof requestType === 'string') {
        validate = this.ajv.getSchema(requestType) ?? null;
      } else {
        // Create a new AJV validate for inline object types.
        // This assumes these will never reference other type definitions.
        const requestAjv = new Ajv();
        validate = requestAjv.compile(requestType);
      }
      if (!validate) {
        throw new Error(`Unable to get schema for '${requestType}'`);
      }
      return validate;
    }
    return null;
  }

  /** Throw if any routes declared in the API spec have not been implemented. */
  assertAllRoutesRegistered() {
    if (!this.apiSchema) {
      throw new Error('TypedRouter.checkComplete requires JSON Schema');
    }

    const expected = new Set<string>();
    const {required: endpoints, properties: endpointSpecs} = this.apiSchema;
    for (const path of endpoints) {
      const methods = endpointSpecs[path].required;
      for (const method of methods) {
        expected.add(`${method} ${path}`);
      }
    }

    for (const {method, path} of this.registrations) {
      const key = `${method} ${path}`;
      expected.delete(key);
    }

    if (expected.size > 0) {
      const missing = Array.from(expected.values()).join('\n');
      throw new Error(
        `Failed to register these endpoints, which were specified in API JSON Schema:\n${missing}`,
      );
    }
  }
}
