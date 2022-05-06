import bodyParser from 'body-parser';
import express from 'express';
import {assert as assertType, _} from 'spec.ts';
import request from 'supertest';

import {API, User} from './api';
import apiSchemaJson from './api.schema.json';
import {HTTPError, TypedRouter} from '../typed-router';

test('TypedRouter', async () => {
  const app = express();
  app.use(bodyParser.json());

  const router = new TypedRouter<API>(app, apiSchemaJson);

  let users: User[] = [
    {
      id: 'fred',
      name: 'Fred',
      age: 42,
    },
    {
      id: 'wilma',
      name: 'Wilma',
      age: 41,
    },
  ];

  router.get('/random', async () => ({random: 7}));

  router.get('/users', async (_params, {query: {nameIncludes, minAge}}, _res) => {
    if (nameIncludes !== undefined) {
      expect(typeof nameIncludes).toEqual('string');
    }
    if (minAge !== undefined) {
      expect(typeof minAge).toEqual('number');
    }
    return {
      users: users.filter(
        user =>
          (!nameIncludes || user.name.includes(nameIncludes)) &&
          (!minAge || user.age >= minAge),
      ),
    };
  });

  router.post('/users', async ({}, user, request, response) => {
    assertType(user, _ as {age: number; name: string});
    assertType(request.params, _ as {});
    assertType(request.body, _ as {age: number; name: string});

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

  router.registerEndpoint(
    'put',
    '/users/:userId',
    async (params, {age, name}, request, response) => {
      assertType(params, _ as {userId: string});
      assertType(request.params, _ as {userId: string});
      assertType(request.body, _ as {age?: number; name?: string});

      const {userId} = params;
      const user = userOr404(userId);
      if (name) {
        user.name = name;
      }
      if (age) {
        user.age = age;
      }
      return user;
    },
  );

  router.registerEndpoint('delete', '/users/:userId', async ({userId}) => {
    const user = userOr404(userId);
    users = users.filter(u => u !== user);
    return user;
  });
  router.registerEndpoint('patch', '/users/:userId', async () => {
    throw new Error('Not implemented');
  });
  router.post('/complex', async ({}, body) => {
    assertType(body.user, _ as User | null);
    return users[0];
  });
  router.patch('/complex', async ({}, body) => {
    return users[0];
  });

  const api = request(app);

  const responseAllUsers = await api.get('/users').expect(200);
  expect(responseAllUsers.body).toEqual({users});

  const responseNameIncludes = await api.get('/users?nameIncludes=red').expect(200);
  expect(responseNameIncludes.body).toEqual({users: [users[0]]});

  const responseMinAge = await api.get('/users?minAge=42');
  expect(responseMinAge.body).toEqual({users: [users[0]]});

  const fredResponse = await api.get('/users/fred').expect(200);
  expect(fredResponse.body).toEqual({id: 'fred', name: 'Fred', age: 42});

  await api.get('/users/pebbles').expect(404, {error: 'No such user pebbles'});

  await api.put('/users/pebbles').expect(404);

  const responseNewWilma = await api
    .put('/users/wilma')
    .send({age: 42})
    .set('Accept', 'application/json')
    .expect(200);
  expect(responseNewWilma.body).toEqual({id: 'wilma', name: 'Wilma', age: 42});

  const pebblesResponse = await api
    .post('/users')
    .set('Accept', 'application/json')
    .send({name: 'Pebbles', age: 2})
    .expect(201);
  expect(pebblesResponse.body).toEqual({
    id: 'id',
    name: 'Pebbles',
    age: 2,
  });

  await api.get('/users/id').expect(200);
  await api.delete('/users/wilma').expect(200);
  await api.get('/users/wilma').expect(404);

  // Request validation tests
  await api
    .post('/users')
    .send({age: 42})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: `data should have required property 'name'`,
      });
    });

  await api
    .put('/users/fred')
    .send({age: '42'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: 'data.age should be number',
      });
    });

  await api
    .put('/users/fred')
    .send({lastName: 'Flintstone'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: 'data should NOT have additional properties',
      });
    });

  await api
    .post('/complex')
    .send({user: 'not a user'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data.user should be object, data.user should be null, data.user should match some schema in anyOf"`,
      );
    });

  await api.post('/complex').send({user: null}).set('Accept', 'application/json').expect(200);

  await api
    .post('/complex')
    .send({user: {id: 'id', name: 'name'}})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data.user should have required property 'age', data.user should be null, data.user should match some schema in anyOf"`,
      );
    });

  await api
    .post('/complex')
    .send({user: {id: 'id', name: 'name', age: 42}})
    .set('Accept', 'application/json')
    .expect(200);

  await api
    .patch('/complex')
    .send({id: 'id', name: 'name', age: 42})
    .set('Accept', 'application/json')
    .expect(200);

  await api
    .patch('/complex')
    .send({id: 'id', name: 'name'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data should have required property 'age'"`,
      );
    });

  await api
    .patch('/complex')
    .send({name: 'name', age: 42})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data should have required property 'id'"`,
      );
    });

  router.assertAllRoutesRegistered();
});

// to test:
// - types for handlers
// - returning a non-Promise is an error
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

test('Throwing HTTPError should set status code', async () => {
  const app = express();
  const router = new TypedRouter<API>(app, apiSchemaJson);

  class PGError extends Error {
    constructor(public code: string) {
      super();
    }
  }

  router.get('/users', async () => {
    return {users: [] as User[]};
  });

  router.get('/users/:userId', async ({userId}) => {
    if (userId === 'throw-400') {
      throw new HTTPError(400, 'Very bad request');
    } else if (userId === 'throw-pg-error') {
      // See https://github.com/danvk/crosswalk/issues/6
      throw new PGError('23505');
    }

    return {
      id: '1',
      name: 'John',
      age: 34,
    };
  });

  const api = request(app);
  let r = await api.get('/users/fred').expect(200);
  expect(r.body).toMatchObject({
    name: 'John',
    age: 34,
  });

  r = await api.get('/users?minAge=Fred').expect(400);
  expect(r.body).toMatchObject({error: 'data.minAge should be number'});

  r = await api.get('/users?maxAge=5').expect(400);
  expect(r.body).toMatchObject({error: 'data should NOT have additional properties'});

  r = await api.get('/users/throw-400').expect(400);
  expect(r.body).toMatchObject({error: 'Very bad request'});

  r = await api.get('/users/throw-pg-error').expect(500);
  expect(r.body).toEqual({});
});

test('Custom 400 handler', async () => {
  const app = express();
  const router = new TypedRouter<API>(app, apiSchemaJson, {
    invalidRequestHandler({which, response, errors, ajv}) {
      expect(which).toEqual('body');
      const err = ajv.errorsText(errors);
      response.status(418).send(`Bad request, not a teapot: ${err}`);
    },
  });
  router.put('/users/:userId', async () => null as any);

  const api = request(app);
  const r = await api
    .put('/users/fred')
    .send({age: '42'})
    .set('Accept', 'application/json')
    .expect(418);
  expect(r.text).toMatchInlineSnapshot(`"Bad request, not a teapot: data should be object"`);
});

test.only('router middleware', async () => {
  const app = express();
  const router = new TypedRouter<API>(app, apiSchemaJson);

  let lastCall: any = null;
  router.useRouterMiddleware((req, res, next) => {
    const {params} = req;
    // type is {} | {userId: string}
    lastCall = {
      params,
      path: req.path,
      route: req.route.path,
    };
    if ('userId' in params && params.userId === 'badguy') {
      res.status(403).send('Forbidden');
    } else {
      next();
    }
  });

  router.get('/users', async () => {
    return {users: []};
  });

  router.get('/users/:userId', async ({userId}) => {
    return {
      id: '1',
      name: 'John',
      age: 34,
    };
  });

  const api = request(app);
  let r = await api.get('/users/fred').expect(200);
  expect(r.body).toMatchObject({
    name: 'John',
    age: 34,
  });
  expect(lastCall).toMatchInlineSnapshot(`
    Object {
      "params": Object {
        "userId": "fred",
      },
      "path": "/users/fred",
      "route": "/users/:userId",
    }
  `);
  await api.get('/users/badguy').expect(403);
  expect(lastCall).toMatchInlineSnapshot(`
    Object {
      "params": Object {
        "userId": "badguy",
      },
      "path": "/users/badguy",
      "route": "/users/:userId",
    }
  `);

  const {body} = await api.get('/users').expect(200);
  expect(body).toEqual({users: []});
  expect(lastCall).toMatchInlineSnapshot(`
    Object {
      "params": Object {},
      "path": "/users",
      "route": "/users",
    }
  `);
});
