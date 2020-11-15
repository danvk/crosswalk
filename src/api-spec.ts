export interface Endpoint<Request, Response> {
  request: Request;
  response: Response;
}

export type GetEndpoint<Response> = Endpoint<null, Response>;
