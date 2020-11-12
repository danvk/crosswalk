export interface Endpoint<Params extends object, Request, Response> {
  request: Request;
  response: Response;
  params: Params;
}

export type GetEndpoint<Params extends object, Response> = Endpoint<Params, null, Response>;

export interface Actor {
  id: string;
  name: string;
  dateOfBirthISO: string;
}

export interface Movie {
  id: string;
  title: string;
  plotSummary: string;
  year: number;
  revenueUsd: number;
  cast: Actor[];
}

export interface MoviesResponse {
  movies: Movie[];
}

export interface CreateMovieRequest extends Omit<Movie, 'id' | 'cast'> {
  castActorIds: string[]
};

export interface API {
  '/movies': {
    get: GetEndpoint<{}, MoviesResponse>;
    post: Endpoint<{}, CreateMovieRequest, Movie>;
  },
  '/movies/:movieId': {
    get: GetEndpoint<{movieId: string}, Movie>;
    patch: Endpoint<{movieId: string}, Partial<CreateMovieRequest>, Movie>;
  }
  '/movies/:movieId/actors': {
    get: GetEndpoint<{movieId: string}, Actor[]>;
  }
  '/movies/:movieId/actors/:actorId': {
    get: GetEndpoint<{movieId: string; actorId: string}, Actor>;
    delete: Endpoint<{movieId: string; actorId: string}, {}, Actor>;
  }
}
