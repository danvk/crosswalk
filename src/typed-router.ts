/** Type-safe wrapper around Express router for REST APIs */

import {ErrorObject, ValidateFunction, Ajv} from 'ajv';
import express from 'express';

import {Endpoint, HTTPVerb} from './api-spec';
import {STATUS_CODES} from './status-codes';
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

type AnyEndpoint = Endpoint<any, any, any>;

type ExpressRequest<Path extends string, Spec> = unknown &
  express.Request<
    ExtractRouteParams<Path>,
    SafeKey<Spec, 'response'>,
    SafeKey<Spec, 'request'>,
    SafeKey<Spec, 'query'>
  >;

type ExpressResponse<Spec> = unknown & express.Response<SafeKey<Spec, 'response'>>;

const registerWithBody =
  <Method extends HTTPVerb, API>(method: Method, router: TypedRouter<API>) =>
  <
    Path extends PathsForMethod<API, Method>,
    Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>,
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

const registerWithoutBody =
  <Method extends HTTPVerb, API>(method: Method, router: TypedRouter<API>) =>
  <
    Path extends PathsForMethod<API, Method>,
    Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>,
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

export interface InvalidRequestHandlerArgs {
  /** Which part of the request was invalid (request body or query parameters)? */
  which: 'body' | 'query';
  request: express.Request;
  response: express.Response;
  /** The invalid payload object */
  payload: unknown;
  /** Ajv validator that found the problem. */
  ajv: Ajv;
  /** List of errors with the payload, as reported by Ajv. */
  errors: ErrorObject[];
}

export function defaultInvalidRequestHandler({
  response,
  payload,
  ajv,
  errors,
}: InvalidRequestHandlerArgs) {
  response.status(400).json({
    error: ajv.errorsText(errors),
    errors,
    invalidRequest: payload,
  });
}

export interface TypedRouterOptions {
  invalidRequestHandler: (obj: InvalidRequestHandlerArgs) => void;
}

export class TypedRouter<API> {
  router: express.Router;
  apiSchema?: any;
  ajv?: Ajv;
  middlewareFns: express.RequestHandler[];
  registrations: {path: string; method: HTTPVerb}[];
  handleInvalidRequest: TypedRouterOptions['invalidRequestHandler'];

  constructor(router: express.Router, apiSchema?: any, options?: TypedRouterOptions) {
    this.router = router;
    if (apiSchema) {
      this.apiSchema = apiSchema;
      this.ajv = new Ajv({allErrors: true});
      this.ajv.addSchema(apiSchema);
    }
    this.handleInvalidRequest = options?.invalidRequestHandler ?? defaultInvalidRequestHandler;
    this.registrations = [];
    this.middlewareFns = [];
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
    Spec extends SafeKey<API[Path], Method> = SafeKey<API[Path], Method>,
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
    const bodyValidate = this.getValidator(route, method, 'request');
    const queryValidate = this.getValidator(route, method, 'query');
    this.registrations.push({path: route as string, method});

    let handlerFn = (...[req, response, next]: RequestParams) => {
      const {body, query} = req;

      if (bodyValidate && !bodyValidate(body)) {
        return this.handleInvalidRequest({
          which: 'body',
          request: req,
          response,
          ajv: this.ajv!,
          payload: body,
          errors: bodyValidate.errors!,
        });
      }

      if (queryValidate && !queryValidate(query)) {
        return this.handleInvalidRequest({
          which: 'query',
          request: req,
          response,
          ajv: this.ajv!,
          payload: query,
          errors: queryValidate.errors!,
        });
      }

      if (req.app.get('env') === 'test') {
        // eslint-disable-next-line no-console
        console.debug(method, route, 'params=', req.params, 'body=', body, 'query=', query);
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
          if (
            error instanceof HTTPError ||
            (error.code && STATUS_CODES.indexOf(error.code) >= 0)
          ) {
            response.status(error.code).json({error: error.message});
          } else {
            next(error);
          }
        });
    };

    for (let i = this.middlewareFns.length - 1; i >= 0; i--) {
      const middlewareFn = this.middlewareFns[i];
      const prevHandlerFn = handlerFn;
      handlerFn = (req: any, res: any, next: any) =>
        middlewareFn(req, res, () => prevHandlerFn(req, res, next));
    }

    this.router[method](route as any, handlerFn);
  }

  /**
   * Add a "route-aware" middleware function.
   *
   * This runs after a route has been matched, but before the request body has been validated
   * and before the request handler function runs. It's convenient to access
   * req.params and req.route from this sort of middleware, e.g. to apply access controls.
   *
   * Like any middleware, this function should either handle the request or call next().
   */
  useRouterMiddleware(
    fn: (
      request: ExpressRequest<keyof API & string, SafeKey<API[keyof API], HTTPVerb>>,
      response: express.Response,
      next: express.NextFunction,
    ) => void,
  ): this {
    this.middlewareFns.push(fn as any);
    return this;
  }

  /** Recursively resolve schema references to find the validation type */
  private resolveSchemaType(schema: any, apiSchema: any): any {
    if (!schema) return null;

    // If it's a direct reference, resolve it
    if (typeof schema === 'string' && schema.startsWith('#/definitions/')) {
      const refName = schema.slice('#/definitions/'.length);
      return this.resolveSchemaType(apiSchema.definitions[refName], apiSchema);
    }

    // If it's an object with a reference, resolve that
    if (schema.$ref) {
      return this.resolveSchemaType(schema.$ref, apiSchema);
    }

    // If it's a null type, return null
    if (schema.type === 'null') {
      return null;
    }

    // Otherwise return the schema as is (could be inline type or resolved type)
    return schema;
  }

  /** Get a validation function for request bodies for the endpoint, or null if not applicable. */
  getValidator(
    route: string,
    method: HTTPVerb,
    property: 'request' | 'query',
  ): ValidateFunction | null {
    const {apiSchema} = this;
    if (!apiSchema) {
      return null;
    }

    const apiDef = apiSchema.properties as any;
    if (!apiDef[route]) {
      throw new Error(`API JSONSchema is missing entry for ${route}`);
    }

    // Get the endpoint schema and resolve it
    const endpointSchema = apiDef[route].properties[method];
    if (!endpointSchema) {
      throw new Error(`API JSONSchema is missing ${method} method for ${route}`);
    }

    const resolvedEndpoint = this.resolveSchemaType(endpointSchema, apiSchema);
    if (!resolvedEndpoint || !resolvedEndpoint.properties) {
      throw new Error(`Invalid endpoint schema for ${method} ${route}`);
    }

    const validateType = this.resolveSchemaType(
      resolvedEndpoint.properties[property],
      apiSchema,
    );
    if (!validateType && this.ajv) {
      return null;
    }

    if (validateType && this.ajv) {
      let validate;
      if (typeof validateType === 'string') {
        validate = this.ajv.getSchema(validateType) ?? null;
      } else {
        // Create a new AJV validate for inline object types.
        const requestAjv = new Ajv({coerceTypes: property === 'query'});
        validate = requestAjv.compile({
          $schema: apiSchema.$schema,
          definitions: apiSchema.definitions,
          ...validateType,
        });
      }
      if (!validate) {
        throw new Error(`Unable to get schema for '${validateType}'`);
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
