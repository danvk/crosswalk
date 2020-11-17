import { Endpoint, GetEndpoint } from "./api-spec";

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
    get: GetEndpoint<MoviesResponse>;
    /** Create a new movie in the database. */
    post: Endpoint<CreateMovieRequest, Movie>;
  },
  '/movies/:movieId': {
    get: GetEndpoint<Movie>;
    patch: Endpoint<Partial<CreateMovieRequest>, Movie>;
  }
  '/movies/:movieId/actors': {
    get: GetEndpoint<Actor[]>;
  }
  '/movies/:movieId/actors/:actorId': {
    get: GetEndpoint<Actor>;
    delete: Endpoint<{}, Actor>;
  }
}
