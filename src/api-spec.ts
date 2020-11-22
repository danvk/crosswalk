export interface Endpoint<Request, Response> {
  request: Request;
  response: Response;
}

export type GetEndpoint<Response> = Endpoint<null, Response>;

export type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface APISpec {
  [path: string]: {
    [method in HTTPVerb]?: Endpoint<any, any>;
  };
}
