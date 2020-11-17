/** Type-safe wrapper around fetch() for REST APIs */

import { compile } from "path-to-regexp";

import { ExtractRouteParams, SafeKey, HTTPVerb, Unionize } from "./utils";

type ExtractRouteParamsVarArgs<T extends string> =
  {} extends ExtractRouteParams<T> ? [] : [params: ExtractRouteParams<T>];

/** Utility for safely constructing API URLs */
export function apiUrlMaker<API>(prefix?: string) {
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

export async function fetchJson(
  url: string,
  method: HTTPVerb,
  payload: unknown
) {
  const response = await fetch(url, {
    method,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  return response.json();
}

export function typedApi<API>(options?: Options) {
  const { prefix = "" } = options || {};
  const fetcher = options?.fetch ?? fetchJson;

  const urlMaker = apiUrlMaker<API>(prefix);

  type Paths = keyof API & string;
  type GetPaths = Extract<Unionize<API>, { v: { get: any } }>["k"] & Paths;
  type PostPaths = Extract<Unionize<API>, { v: { post: any } }>["k"] & Paths;

  const request = <
    Path extends Paths,
    Method extends keyof API[Path] & HTTPVerb
  >(
    endpoint: Path,
    method: Method
  ) => {
    type Params = ExtractRouteParams<Path & string>;
    type Endpoint = API[Path][Method];
    type Request = SafeKey<Endpoint, "request">;
    type Response = SafeKey<Endpoint, "response">;
    const makeUrl = urlMaker(endpoint);
    return (queryParams: Params, body: Request): Promise<Response> =>
      fetcher((makeUrl as any)(queryParams), method, body) as Promise<Response>;
  };

  return {
    request,

    get: <Path extends GetPaths>(endpoint: Path) => {
      type ParamsList = ExtractRouteParamsVarArgs<Path & string>;
      type Endpoint = SafeKey<API[Path], "get">;
      type Response = SafeKey<Endpoint, "response">;
      return (...params: ParamsList): Promise<Response> =>
        request(endpoint, "get" as any)(params?.[0] as any, null as any);
    },

    post: <Path extends PostPaths>(endpoint: Path) => {
      type Params = ExtractRouteParams<Path & string>;
      type Endpoint = SafeKey<API[Path], "post">;
      type Request = SafeKey<Endpoint, "request">;
      type Response = SafeKey<Endpoint, "response">;
      return (params: Params, request: Request): Promise<Response> =>
        request(endpoint, "post" as any)(params, request);
    },
  };
}
