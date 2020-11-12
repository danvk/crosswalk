import {Router} from 'express';
import { Actor, Movie } from './api';
import { HTTPError, registerEndpoint } from './typed-router';

const luke: Actor = {
  id: 'luke',
  name: 'Mark Hamill',
  dateOfBirthISO: '1951-09-25',
};

const han: Actor = {
  id: 'han',
  name: 'Harrison Ford',
  dateOfBirthISO: '1942-07-13',
};

const leia: Actor = {
  id: 'leia',
  name: 'Carrie Fisher',
  dateOfBirthISO: '1956-10-21',
};

const ACTOR_DB = [luke, han, leia];

const MOVIE_DB: Movie[] = [
  {
    id: '123',
    title: 'Star Wars IV',
    plotSummary: '',
    year: 1977,
    revenueUsd: 775_400_000,
    cast: [
      luke,
      han,
      leia,
    ]
  }
]

export function register(router: Router) {
  registerEndpoint(router, 'get', '/movies', async () => ({movies: MOVIE_DB}));

  registerEndpoint(router, 'post', '/movies', async ({}, body) => {
    const {castActorIds, ...movie} = body;
    const cast: Actor[] = [];
    for (const actorId of body.castActorIds) {
      const actor = ACTOR_DB.find(actor => actor.id === actorId);
      if (!actor) {
        throw new HTTPError(403, `No such actor ${actorId}`);
      }
      cast.push(actor);
    }

    const newMovie: Movie = {
      id: '' + Math.floor(10000 * Math.random()),
      ...movie,
      cast,
    }
    MOVIE_DB.push(newMovie);

    return newMovie;
  });

  registerEndpoint(router, 'get', '/movies/:movieId', async ({movieId}) => {
    const movie = MOVIE_DB.find(m => m.id === movieId);
    if (!movie) {
      throw new HTTPError(404, `No such movie ${movieId}`);
    }
    return movie;
  });
}
