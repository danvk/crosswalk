/** Type-safe wrapper around fetch() for REST APIs */

import {compile} from 'path-to-regexp';
import {HTTPVerb} from './api-spec';

import {ExtractRouteParams, SafeKey, DeepReadonly, PathsForMethod} from './utils';

// This allows null or {}, but not {key: 'value'}.
// This comes up when there are no path parameters, but there are/may be query params.
type PlaceholderEmpty = null | {[pathParam: string]: never};

// No query or path params -> don't take any arguments
// No query params -> only take path params (one argument)
// No path params ->
//   Either null or {} is permitted as the path argument.
//   Query param is mandatory if there are non-optional query params
type ParamVarArgs<Params, Query> = DeepReadonly<
  [Query] extends [null]
    ? [{}] extends [Params]
      ? [] // no path params, no query
      : [params: Params] // path params, no query allowed
    : [{}, {}] extends [Params, Query]
    ? // No path params, optional query params; zero arg call is OK
      [params?: PlaceholderEmpty, query?: Query]
    : [
        params: [{}] extends Params ? PlaceholderEmpty : Params,
        ...query: [{}] extends [Query] ? [query?: Query] : [query: Query]
      ]
>;

// If there's an explicit query param, use it. Otherwise assume GET.
type QueryType<Endpoint, M extends undefined | keyof Endpoint> = SafeKey<
  SafeKey<Endpoint, M extends undefined ? 'get' : M>,
  'query'
>;

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix = '') {
  /**
   * If a method is provided we use the query params for the given method.
   * If not, the query params correspond to the intersection of all methods for the endpoint,
   * interpreted as "exact" types (i.e. no unspecified properties allowed).
   */
  function createUrlMakerForEndpoint<
    Args extends [endpoint: keyof API, method?: AllMethods],
    Path extends Args[0] = Args[0],
    P extends API[Path] = API[Path],
    AllMethods extends keyof P = keyof P
  >(...[endpoint, _method]: Args) {
    const toPath = compile(endpoint as string);
    type Method = Args[1];
    type Params = ExtractRouteParams<Path & string>;
    type Query = QueryType<P, Method>;
    const fn = (...paramsList: ParamVarArgs<Params, Query>): string => {
      const params = paramsList as any;
      const queryString = params[1] ? '' + new URLSearchParams(params[1]) : '';
      return prefix + toPath(params[0]) + (queryString ? '?' + queryString : '');
    };

    return fn;
  }

  return createUrlMakerForEndpoint;
}

export interface Options {
  /** Prefix to add to all API endpoints (e.g. /api/v0) */
  prefix?: string;
  /** Function to use for fetching. Defaults to browser fetch. */
  fetch?: (url: string, method: HTTPVerb, payload: unknown) => Promise<unknown>;
}

export async function fetchJson(url: string, method: HTTPVerb, payload: unknown) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export function typedApi<API>(options?: Options) {
  const {prefix = ''} = options || {};
  const fetcher = options?.fetch ?? fetchJson;

  const urlMaker = apiUrlMaker<API>(prefix);

  const requestWithBody = <Method extends HTTPVerb>(method: Method) => <
    Path extends PathsForMethod<API, Method>
  >(
    endpoint: Path,
  ) => {
    type Params = ExtractRouteParams<Path & string>;
    type Endpoint = SafeKey<API[Path], Method>;
    type Request = DeepReadonly<SafeKey<Endpoint, 'request'>>;
    type Response = SafeKey<Endpoint, 'response'>;
    type Query = SafeKey<Endpoint, 'query'>;
    type Args = [params: Params, body: Request, ...queryArgs: ([Query] extends [{}] ? [] : [query?: Query])];
    const makeUrl = urlMaker(endpoint);
    return (...[params, body, query]: Args): Promise<Response> =>
      fetcher((makeUrl as any)(params, query), method, body) as Promise<Response>;
  };

  const requestWithoutBody = <Method extends HTTPVerb>(method: Method) => <
    Path extends PathsForMethod<API, Method>
  >(
    endpoint: Path,
  ) => {
    type Params = ExtractRouteParams<Path & string>;
    type Endpoint = SafeKey<API[Path], Method>;
    type Response = SafeKey<Endpoint, 'response'>;
    type Query = SafeKey<Endpoint, 'query'>;

    return (...params: ParamVarArgs<Params, Query>): Promise<Response> =>
      (requestWithBody(method)(endpoint) as any)(
        params?.[0],
        null as any,
        params?.[1]
      );
  };

  return {
    get: requestWithoutBody('get'),
    delete: requestWithoutBody('delete'),

    post: requestWithBody('post'),
    patch: requestWithBody('patch'),
    put: requestWithBody('put'),

    request: <Method extends HTTPVerb>(method: Method, path: PathsForMethod<API, Method>) =>
      requestWithBody(method)(path),
  };
}
