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
    id: 'fred',
    name: 'Fred',
    age: 42,
  }, {
    id: 'wilma',
    name: 'Wilma',
    age: 41,
  }];

  // This is async, so it does return a promise.
  router.get('/users', async () => ({users}));

  router.registerEndpoint('post', '/users', async ({}, user, _request, response) => {
    const newUser = {id: 'id', ...user};
    users.push(newUser);
    response.status(201);
    return newUser;
  });

  const userOr404 = (userId: string) => {
    const user = users.find(u => u.id === userId);
    if (user) {
      return user;
    }
    throw new HTTPError(404, `No such user ${userId}`);
  };

  router.get('/users/:userId', async ({userId}) => userOr404(userId));

  expect(() => {
    // At this point we're missing the patch & delete handlers
    router.assertAllRoutesRegistered();
  }).toThrowError();

  router.registerEndpoint('put', '/users/:userId', async ({userId}, {age, name}, _request, response) => {
    const user = userOr404(userId);
    if (name) {
      user.name = name;
    }
    if (age) {
      user.age = age;
    }
    return user;
  });

  const api = request(app);

  const responseUsers = await api.get('/users').expect(200);
  expect(responseUsers.body).toEqual({users});

  const fredResponse = await api.get('/users/fred').expect(200);
  expect(fredResponse.body).toEqual({id: 'fred', name: 'Fred', age: 42});

  await api.get('/users/pebbles').expect(404, {error: 'No such user pebbles'});

  await api.put('/users/pebbles').expect(404);

  const responseNewWilma = await api.put('/users/wilma')
    .send({age: 42})
    .set('Accept', 'application/json')
    .expect(200);
  expect(responseNewWilma.body).toEqual({id: 'wilma', name: 'Wilma', age: 42});

  const pebblesResponse = await api.post('/users').set('Accept', 'application/json').send({name: 'Pebbles', age: 2}).expect(201);
  expect(pebblesResponse.body).toEqual({
    id: 'id',
    name: 'Pebbles',
    age: 2,
  });
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
