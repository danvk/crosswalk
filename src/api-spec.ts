export interface Endpoint<Request, Response, Query = null> {
  request: Request;
  response: Response;
  query: Query;
}

export type GetEndpoint<Response, Query = null> = Endpoint<null, Response, Query>;

export type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface APISpec {
  [path: string]: {
    [method in HTTPVerb]?: Endpoint<any, any, any>;
  };
}
