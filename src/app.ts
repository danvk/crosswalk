import bodyParser from 'body-parser';
import express from 'express';

import * as movies from './movies';

const app = express();
app.use(bodyParser.json());
movies.register(app);

app.listen(4567, () => {
  console.log(`App is running at http://localhost:4567`);
});
