/** Type-safe wrapper around fetch() for REST APIs */

import {compile} from 'path-to-regexp';
import {HTTPVerb} from './api-spec';

import {ExtractRouteParams, SafeKey, DeepReadonly, PathsForMethod} from './utils';

// No Query Params -> Only take in path params
// No Path Params -> Only take nothing OR blank path params and optional query
// Both Query and Path Params -> Take both with query being optional
// prettier-ignore
type ParamVarArgs<Params, Query> = DeepReadonly<
  [Query] extends [never]
    ? [{}] extends [Params]
      ? []
      : [params: Params]
    : [{}] extends [Params]
      ? [{}] extends [Query] ?
        [params?: null | {[pathParam: string]: never}, query?: Query] :
        [params: null | {[pathParam: string]: never}, query: Query]
      : [{}] extends [Query] ?
        [params: Params, query?: Query] :
        [params: Params, query: Query]
>;

type QueryTypes<P, Methods extends keyof P> = {
  [M in Methods]: SafeKey<P[M], 'query'>
};

// This is the intersection of all the value types for an object,
// e.g. {a: A; b: B; c: C;} --> A & B & C
// See https://stackoverflow.com/a/66445507/388951
type ValueIntersection<O extends object> = {
  [K in keyof O]: (x: O[K]) => void
}[keyof O] extends (x: infer I) => void ? I : never;

type Simplify<T> = {[K in keyof T]: T[K]};

type QueryTypeForMethod<Endpoint, M extends keyof Endpoint>
  = Simplify<ValueIntersection<QueryTypes<Endpoint, M>>>;

// import {API as TestAPI} from './__tests__/api';
// type T1 = Simplify<ValueIntersection<QueryTypes<TestAPI, '/random'>>>;
// type T2 = Readonly<Simplify<ValueIntersection<QueryTypes<TestAPI, '/users'>>>>;
// type T3 = Simplify<ValueIntersection<QueryTypes<TestAPI, '/users/:userId'>>>;

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix = '') {
  /** If a method is provided we use the query params for the given method */
  function createUrlMakerForEndpoint<
    Args extends [endpoint: keyof API, method?: AllMethods],
    Path extends Args[0] = Args[0],
    AllMethods extends keyof API[Path] = keyof API[Path],
    Method extends AllMethods = Args extends [any, infer M] ? M : AllMethods,
    Params = ExtractRouteParams<Path & string>,
    Query = QueryTypeForMethod<API[Path], Method>,
  >(
    ...[endpoint, _method]: Args
  ): (...params: ParamVarArgs<Params, Query>) => string {
    const toPath = compile(endpoint as string);
    return (...paramsList: readonly any[]) =>
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
