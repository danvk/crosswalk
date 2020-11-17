import { API } from "./api";
import { apiUrlMaker, typedApi } from "./typed-request";

const api = typedApi<API>();

const urlMaker = apiUrlMaker<API>();
const moviesUrl = urlMaker('/movies')();
const getMovieUrl = urlMaker('/movies/:movieId');

(async () => {
  const movies1 = await api.request('/movies', 'get')({}, null);
  const movies2 = await api.get('/movies')();

  const getActors = api.get('/movies/:movieId/actors');
  const actors = await getActors({movieId: 'ep4'});
  console.log(actors.length);

  const createMovie = api.post('/movies');
  const newMovie = await createMovie({}, {
    year: 1997,
    title: 'Episode I',
    plotSummary: 'Marketing marketing marketing',
    revenueUsd: 123_456_789,
    castActorIds: ['leia'],
  });

  console.log(newMovie.id);
})();
