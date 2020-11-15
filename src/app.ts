import bodyParser from 'body-parser';
import express from 'express';

import {API} from './api';
import jsonSchema from './api.schema.json';
import {TypedRouter} from './typed-router';

import * as movies from './movies';

const app = express();
app.use(bodyParser.json());

const typedRouter = new TypedRouter<API>(app, jsonSchema);

movies.register(typedRouter);

app.listen(4567, () => {
  console.log(`App is running at http://localhost:4567`);
});
