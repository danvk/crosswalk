import bodyParser from 'body-parser';
import express from 'express';
import multer from 'multer';
import request from 'supertest';

import {API, User} from './api';
import apiSchemaJson from './api.schema.json';
import {HTTPError, TypedRouter} from '../typed-router';

test('TypedRouter', async () => {
  const app = express();
  app.use(bodyParser.json());

  const router = new TypedRouter<API>(app, apiSchemaJson);

  // Configure multer for file uploads
  const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: {
      fileSize: 1024 * 1024 // 1MB limit
    }
  });

  let users: User[] = [
    {
      id: 'fred',
      name: 'Fred',
      age: 42,
      phoneNumbers: [],
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
      role: 'user',
      fromSystem: 'google',
      signupMethod: 'email',
    },
    {
      id: 'wilma',
      name: 'Wilma',
      age: 41,
      phoneNumbers: [],
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
      role: 'user',
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

  router.post('/users', async (_, user, request, response) => {
    const _userForCheck = user;
    //     ^? const _userForCheck: CreateUserRequest
    const {params, body} = request;
    params;
    // ^? const params: {}
    body;
    // ^? const body: CreateUserRequest

    const newUser = {
      id: 'id',
      ...user,
      role: 'user' as const,
      fromSystem: 'google' as const,
      signupMethod: 'email' as const,
    };
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
    async (pathParams, {age, name}, request, _response) => {
      //   ^? (parameter) pathParams: { userId: string; }
      const {params, body} = request;
      params;
      // ^? const params: { userId: string; }
      body;
      // ^? const body: {
      //        name?: string;
      //        age?: number;
      //        phoneNumbers?: PhoneNumber[];
      //        permanentAddress?: Address;
      //    }

      const {userId} = pathParams;
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
  router.post('/complex', async (_, body) => {
    body.user;
    //   ^? (property) user: User | null
    return users[0];
  });
  router.patch('/complex', async (_, _body) => {
    return users[0];
  });

  router.get('/search', async (_, {query: {numResults}}) => {
    return {users: users.slice(0, numResults)};
  });

  router.useRouterMiddleware((req, res, next) => {
    if (req.route.path === '/upload' && req.method === 'POST') {
      // Use multer middleware for file uploads
      upload.single('file')(req as any, res as any, next);
    } else {
      next();
    }
  });
  router.post('/upload', async (_, body, req) => {
    // Multer puts the file in req.file and other fields in req.body
    const file = (req as any).file;
    
    return {
      success: true,
      filename: file?.originalname || 'unknown.txt',
      size: file?.size || 0,
      formData: body,
    };
  });

  const api = request(app);

  const responseAllUsers = await api.get('/users').expect(200);
  expect(responseAllUsers.body).toEqual({users});

  const responseNameIncludes = await api.get('/users?nameIncludes=red').expect(200);
  expect(responseNameIncludes.body).toEqual({users: [users[0]]});

  const responseMinAge = await api.get('/users?minAge=42');
  expect(responseMinAge.body).toEqual({users: [users[0]]});

  const fredResponse = await api.get('/users/fred').expect(200);
  expect(fredResponse.body).toEqual({
    id: 'fred',
    name: 'Fred',
    age: 42,
    role: 'user',
    fromSystem: 'google',
    signupMethod: 'email',
    phoneNumbers: [],
    permanentAddress: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345',
      location: {
        latitude: 37.774929,
        longitude: -122.419416,
      },
    },
  });

  await api.get('/users/pebbles').expect(404, {error: 'No such user pebbles'});

  await api.put('/users/pebbles').expect(404);

  const responseNewWilma = await api
    .put('/users/wilma')
    .send({age: 42})
    .set('Accept', 'application/json')
    .expect(200);
  expect(responseNewWilma.body).toEqual({
    id: 'wilma',
    name: 'Wilma',
    age: 42,
    role: 'user',
    phoneNumbers: [],
    permanentAddress: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345',
      location: {
        latitude: 37.774929,
        longitude: -122.419416,
      },
    },
  });

  const pebblesResponse = await api
    .post('/users')
    .set('Accept', 'application/json')
    .send({
      name: 'Pebbles',
      age: 2,
      phoneNumbers: [],
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
    })
    .expect(201);
  expect(pebblesResponse.body).toEqual({
    id: 'id',
    name: 'Pebbles',
    age: 2,
    phoneNumbers: [],
    permanentAddress: {
      street: '123 Main St',
      city: 'Anytown',
      state: 'CA',
      zip: '12345',
      location: {
        latitude: 37.774929,
        longitude: -122.419416,
      },
    },
    role: 'user',
    fromSystem: 'google',
    signupMethod: 'email',
  });

  await api.get('/users/id').expect(200);
  await api.delete('/users/wilma').expect(200);
  await api.get('/users/wilma').expect(404);

  // Request validation tests
  await api
    .post('/users')
    .send({
      age: 42,
      phoneNumbers: [],
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
    })
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: `data must have required property 'name'`,
      });
    });

  await api
    .put('/users/fred')
    .send({age: '42'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: 'data/age must be number',
      });
    });

  await api
    .put('/users/fred')
    .send({lastName: 'Flintstone'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body).toMatchObject({
        error: 'data must NOT have additional properties',
      });
    });

  await api
    .post('/complex')
    .send({user: 'not a user'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data/user must be object, data/user must be null, data/user must match a schema in anyOf"`,
      );
    });

  await api.post('/complex').send({user: null}).set('Accept', 'application/json').expect(200);

  // Test file upload
  const uploadResponse = await api
    .post('/upload')
    .field('source', 'test description')
    .attach('file', Buffer.from('test file content'), 'test.txt')
    .expect(200);
  
  expect(uploadResponse.body).toMatchObject({
    success: true,
    filename: 'test.txt',
    size: expect.any(Number),
    formData: {
      source: 'test description',
    },
  });

  await api
    .post('/complex')
    .send({user: {id: 'id', name: 'name'}})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data/user must have required property 'age', data/user must be null, data/user must match a schema in anyOf"`,
      );
    });

  await api
    .post('/complex')
    .send({
      user: {
        id: 'id',
        name: 'name',
        age: 42,
        phoneNumbers: [],
        role: 'user',
        permanentAddress: {
          street: '123 Main St',
          city: 'Anytown',
          state: 'CA',
          zip: '12345',
          location: {
            latitude: 37.774929,
            longitude: -122.419416,
          },
        },
      },
    })
    .set('Accept', 'application/json')
    .expect(200);

  await api
    .patch('/complex')
    .send({
      id: 'id',
      name: 'name',
      age: 42,
      phoneNumbers: [],
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
    })
    .set('Accept', 'application/json')
    .expect(200);

  await api
    .patch('/complex')
    .send({id: 'id', name: 'name'})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data must have required property 'age'"`,
      );
    });

  await api
    .patch('/complex')
    .send({name: 'name', age: 42})
    .set('Accept', 'application/json')
    .expect(400)
    .expect(response => {
      expect(response.body.error).toMatchInlineSnapshot(
        `"data must have required property 'id'"`,
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
  router.get('/users/:userId', async ({id: _}) => users[0]);
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
      phoneNumbers: [],
      role: 'user',
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
    };
  });

  const api = request(app);
  let r = await api.get('/users/fred').expect(200);
  expect(r.body).toMatchObject({
    name: 'John',
    age: 34,
  });

  r = await api.get('/users?minAge=Fred').expect(400);
  expect(r.body).toMatchObject({error: 'data/minAge must be number'});

  r = await api.get('/users?maxAge=5').expect(400);
  expect(r.body).toMatchObject({error: 'data must NOT have additional properties'});

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
  expect(r.text).toMatchInlineSnapshot(`"Bad request, not a teapot: data must be object"`);
});

test('router middleware', async () => {
  const app = express();
  const router = new TypedRouter<API>(app, apiSchemaJson);

  let lastCall: any = null;
  router
    .useRouterMiddleware((req, res, next) => {
      // This is called _before_ the next middleware.
      lastCall = {
        params: req.params,
        path: req.path,
        route: req.route.path,
      };
      next();
    })
    .useRouterMiddleware((req, res, next) => {
      const {params} = req;
      //     ^? const params: {} | { userId: string; }
      if ('userId' in params && params.userId === 'badguy') {
        res.status(403).send('Forbidden');
      } else {
        next();
      }
    });

  router.get('/users', async () => {
    return {users: []};
  });

  router.get('/users/:userId', async ({userId: _}) => {
    return {
      id: '1',
      name: 'John',
      age: 34,
      phoneNumbers: [],
      role: 'user',
      permanentAddress: {
        street: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        zip: '12345',
        location: {
          latitude: 37.774929,
          longitude: -122.419416,
        },
      },
    };
  });

  const api = request(app);
  const r = await api.get('/users/fred').expect(200);
  expect(r.body).toMatchObject({
    name: 'John',
    age: 34,
  });
  expect(lastCall).toMatchInlineSnapshot(`
    {
      "params": {
        "userId": "fred",
      },
      "path": "/users/fred",
      "route": "/users/:userId",
    }
  `);
  await api.get('/users/badguy').expect(403);
  expect(lastCall).toMatchInlineSnapshot(`
    {
      "params": {
        "userId": "badguy",
      },
      "path": "/users/badguy",
      "route": "/users/:userId",
    }
  `);

  const {body} = await api.get('/users').expect(200);
  expect(body).toEqual({users: []});
  expect(lastCall).toMatchInlineSnapshot(`
    {
      "params": {},
      "path": "/users",
      "route": "/users",
    }
  `);
});
