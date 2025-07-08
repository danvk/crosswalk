export interface Endpoint<
  Request,
  Response,
  Query = null,
  ContentType extends 'json' | 'multipart' = 'json',
> {
  request: Request;
  response: Response;
  query: Query;
  contentType: ContentType;
}

export type MultipartEndpoint<Request, Response, Query = null> = Endpoint<
  Request,
  Response,
  Query,
  'multipart'
>;

/** File upload field */
export type File = {__type: 'file'};

export type GetEndpoint<Response, Query = null> = Endpoint<null, Response, Query>;

export type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

export interface APISpec {
  [path: string]: {
    [method in HTTPVerb]?: Endpoint<any, any, any>;
  };
}
