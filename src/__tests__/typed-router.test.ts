import bodyParser from 'body-parser';
import express from 'express';
import request from 'supertest';

import {API, User} from './api';
import apiSchemaJson from './api.schema.json';
import {HTTPError, TypedRouter} from '../typed-router';

test('TypedRouter', async () => {
  const app = express();
  app.use(bodyParser.json());

  const router = new TypedRouter<API>(app, apiSchemaJson);

  const users: User[] = [{
    id: '123',
    name: 'Fred',
    age: 42,
  }, {
    id: '234',
    name: 'Wilma',
    age: 41,
  }];

  // This is async, so it does return a promise.
  router.get('/users', async () => ({users}));

  router.registerEndpoint('post', '/users', async ({}, user) => {
    const newUser = {id: 'id', ...user};
    users.push(newUser);
    return newUser;
  });

  router.get('/users/:userId', async ({userId}) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      return user;
    }
    throw new HTTPError(404, `No such user ${userId}`);
  });

  expect(() => {
    // At this point we're missing the patch & delete handlers
    router.assertAllRoutesRegistered();
  }).toThrowError();

  const api = request(app);

  const responseUsers = await api.get('/users').expect(200);
  expect(responseUsers.body).toEqual({users});

  const fredResponse = await api.get('/users/123').expect(200);
  expect(fredResponse.body).toEqual({id: '123', name: 'Fred', age: 42});

  await api.get('/users/pebbles').expect(404, {error: 'No such user pebbles'});
});

// to test:
// - types for handlers
// - returning a non-Promise is an error
// - HTTPError works as expected
// - mime type
// - redirects work as expected
// - assertComplete works as expected
// - all sorts of input validation
// - installing on a prefix

test('invalid registrations should be type errors', () => {
  const app = express();
  const router = new TypedRouter<API>(app, apiSchemaJson);

  const users: User[] = [];

  // @ts-expect-error (not returning a promise)
  router.get('/users', () => ({users}));

  // @ts-expect-error should be userId, not id
  router.get('/users/:userId', async ({id}) => users[0]);
});
