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
      ? [params?: {}, query?: Query]
      : [params: Params, query?: Query]
>;

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix = '') {
  return <Path extends keyof API>(endpoint: Path & string) => {
    type Params = ExtractRouteParams<Path & string>;
    const toPath = compile(endpoint);
    return (...paramsList: ParamVarArgs<Params, null>) =>
      prefix + toPath(paramsList[0] as any);
  };
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

export async function fetchJson(
  url: string,
  method: HTTPVerb,
  payload: unknown,
  query?: Record<string, string>,
) {
  const response = await fetch(url + (query ? new URLSearchParams(query) : ''), {
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
      fetcher(
        (makeUrl as any)(params),
        method,
        body,
        query ?? (null as any),
      ) as Promise<Response>;
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
