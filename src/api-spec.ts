export interface Endpoint<Request, Response, Query = never> {
  request: Request;
  response: Response;
  query: Query;
}

export type GetEndpoint<Response, Query = never> = Endpoint<null, Response, Query>;

export type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface APISpec {
  [path: string]: {
    [method in HTTPVerb]?: Endpoint<any, any, any>;
  };
}
