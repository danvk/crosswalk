/** Type-safe wrapper around fetch() for REST APIs */

import {compile} from 'path-to-regexp';
import {HTTPVerb} from './api-spec';

import {ExtractRouteParams, SafeKey, DeepReadonly, PathsForMethod} from './utils';

// No Query Params -> Only take in path params
// No Path Params -> Only take nothing OR blank path params and optional query
// Both Query and Path Params -> Take both with query being optional
// prettier-ignore
type ParamVarArgs<Params, Query> = DeepReadonly<
  null extends Query
    ? {} extends Params
      ? []
      : [params: Params]
    : {} extends Params
      ? [params?: Record<string, never>, query?: Query]
      : [params: Params, query?: Query]
>;

type QueryForMethod<Endpoint, Method extends keyof Endpoint> = SafeKey<
  Endpoint[Method],
  'query'
>;

type MergedQueryParams<API, Path extends keyof API> = {
  [K in keyof API[Path]]: (x: SafeKey<API[Path][K], 'query'>) => void;
}[keyof API[Path]] extends (x: infer I) => void
  ? {[K in keyof I]: I[K]}
  : never;

type QueryIntersection<API, Path extends keyof API, P = API[Path]> = Pick<
  MergedQueryParams<API, Path>,
  // @ts-expect-error Unable to do this generically but actually does work. TS issue?
  keyof SafeKey<P[keyof P], 'query'>
>;

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix = '') {
  /** Using overloading here instead of conditional return types because from my testing and Googling they are broken when used as return types */
  /** If a method is not provided we use the intersection (only common) of query params for all methods at the given path */
  function createUrlMakerForEndpoint<
    Path extends keyof API,
    Params = ExtractRouteParams<Path & string>,
    Query = QueryIntersection<API, Path>
  >(endpoint: Path & string): (...params: ParamVarArgs<Params, Query>) => string;
  /** If a method is provided we use the query params for the given method */
  function createUrlMakerForEndpoint<
    Path extends keyof API,
    Method extends keyof API[Path],
    Params = ExtractRouteParams<Path & string>,
    Query = QueryForMethod<API[Path], Method>
  >(
    endpoint: Path & string,
    method: Method,
  ): (...params: ParamVarArgs<Params, Query>) => string;
  function createUrlMakerForEndpoint<Path extends keyof API, Method extends keyof API[Path]>(
    endpoint: Path & string,
    _method?: Method,
  ) {
    const toPath = compile(endpoint);
    return (...paramsList: Record<any, any>[]) =>
      prefix +
      toPath(paramsList[0]) +
      (paramsList[1] ? '?' + new URLSearchParams(paramsList[1]) : '');
  }

  return createUrlMakerForEndpoint;
}

export interface Options {
  /** Prefix to add to all API endpoints (e.g. /api/v0) */
  prefix?: string;
  /** Function to use for fetching. Defaults to browser fetch. */
  fetch?: (
    url: string,
    method: HTTPVerb,
    payload: unknown,
    query?: Record<string, string>,
  ) => Promise<unknown>;
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
      requestWithBody(method)(endpoint)(params?.[0] as any, null as any, params?.[1] as any);
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
