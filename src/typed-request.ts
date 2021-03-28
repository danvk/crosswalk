/** Type-safe wrapper around fetch() for REST APIs */

import {compile} from 'path-to-regexp';
import {HTTPVerb} from './api-spec';

import {
  ExtractRouteParams,
  SafeKey,
  DeepReadonly,
  PathsForMethod,
  ValueIntersection,
  SimplifyType,
} from './utils';

type PlaceholderEmpty = null | {[pathParam: string]: never};

// No query or path params -> don't take any arguments
// No query params -> only take path params (one argument)
// No path params ->
//   Either null or {} is permitted as the path argument.
//   Query param is mandatory if there are non-optional query params
type ParamVarArgs<Params, Query> = DeepReadonly<
  [Query] extends [never]
    ? // This must have arisen from an impossible intersection of query types.
      [
        error: '❌ Must specify an HTTP method (get, post, etc.) to apiUrlMaker for this endpoint',
        _: never,
      ]
    : [Query] extends [null]
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

type QueryTypes<P, Methods extends keyof P> = {
  [M in Methods]: SafeKey<P[M], 'query'>;
};

// Like Pick<T, K>, but doesn't require that K extends keyof T
type LoosePick<T, K> = Pick<T, K & keyof T>;

// This tries to determine which query parameters are required to generate a URL.
// This is easy for a single method, but somewhat involved if we don't know the method.
// In that case, we try to calculate the intersection of the query parameter types for all
// methods as if they were "closed" aka "exact" types.
type SafeQueryTypesForMethod<
  Endpoint,
  M extends keyof Endpoint,
  Q extends QueryTypes<Endpoint, M> = QueryTypes<Endpoint, M>,
  V extends ValueIntersection<Q> = ValueIntersection<Q>,
  P extends LoosePick<V, keyof Q[M]> = LoosePick<V, keyof Q[M]>
> = [V] extends [never]
  ? null
  : [keyof Q[M]] extends [never]
  ? never
  : P extends V
  ? SimplifyType<P>
  : never;

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
    AllMethods extends keyof P = keyof P,
    Method extends AllMethods = Args extends [any, infer M] ? M : AllMethods,
    Params = ExtractRouteParams<Path & string>,
    Query = SafeQueryTypesForMethod<P, Method>
  >(...[endpoint, _method]: Args): (...params: ParamVarArgs<Params, Query>) => string {
    const toPath = compile(endpoint as string);
    return (...paramsList: readonly any[]) => {
      const queryString = paramsList[1] ? '' + new URLSearchParams(paramsList[1]) : '';
      return prefix +
        toPath(paramsList[0]) +
        (queryString ? '?' + queryString : '');
    }
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
    const makeUrl = urlMaker(endpoint);
    return (params: Params, body: Request, query?: Query): Promise<Response> =>
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
      requestWithBody(method)(endpoint)(
        (params as any)?.[0],
        null as any,
        (params as any)?.[1],
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
