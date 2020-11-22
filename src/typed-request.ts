/** Type-safe wrapper around fetch() for REST APIs */

import {compile} from 'path-to-regexp';
import {HTTPVerb} from './api-spec';

import {ExtractRouteParams, SafeKey, DeepReadonly, PathsForMethod} from './utils';

type ExtractRouteParamsVarArgs<T extends string> = {} extends ExtractRouteParams<T>
  ? []
  : [params: Readonly<ExtractRouteParams<T>>];

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix = '') {
  return <Path extends keyof API>(endpoint: Path & string) => {
    const toPath = compile(endpoint);
    return (...paramsList: ExtractRouteParamsVarArgs<Path & string>) =>
      prefix + toPath(paramsList[0] as any);
  };
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
    const makeUrl = urlMaker(endpoint);
    return (queryParams: Params, body: Request): Promise<Response> =>
      fetcher((makeUrl as any)(queryParams), method, body) as Promise<Response>;
  };

  const requestWithoutBody = <Method extends HTTPVerb>(method: Method) => <
    Path extends PathsForMethod<API, Method>
  >(
    endpoint: Path,
  ) => {
    type ParamsList = ExtractRouteParamsVarArgs<Path & string>;
    type Endpoint = SafeKey<API[Path], Method>;
    type Response = SafeKey<Endpoint, 'response'>;
    return (...params: ParamsList): Promise<Response> =>
      requestWithBody(method)(endpoint)(params?.[0] as any, null as any);
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
