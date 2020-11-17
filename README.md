# Typed Router

🚧🏗 _Under construction, work in progress!_ 🏗🚧

This library helps you build type-safe REST APIs using Express using
TypeScript.

Here's the deal:

- You define your API using TypeScript types.
- The typed router will give you:
  - Type API implementations (for your server)
  - Runtime request validation (also server, using ajv and typescript-json-schema)
  - Type safe API requests (for your client code)

Requirements:

- TypeScript 4.1+
- Express

There is an optional requirement of typescript-json-schema if you want runtime
request validation. (You probably do!)

## Usage

First, define your API in `api.ts`:

```ts
import type {Endpoint, GetEndpoint} from 'typed-router';
export interface API {
  '/users': {
    get: GetEndpoint<UsersResponse>;
    post: Endpoint<CreateUserRequest, User>;
  };
  '/users/:userId': {
    get: GetEndpoint<User>;
  }
}
```

Then implement the API (`users.ts`):

```ts
import {API} from './api';
import {TypedRouter} from 'typed-router';

export function registerAPI(router: TypedRouter<API>) {
  router.get('/users', async () => users;
  router.post('/users', async ({}, userInput) => createUser(userInput));
  router.get('/users/:userId', async ({userId}) => getUserById(userId));
}
```

Finally, register it on your Express server (`server.ts`):

```ts
const app = express();
app.use(bodyParser.json());
const typedRouter = new TypedRouter<API>(app);
registerAPI(typedRouter);
app.listen(4567);
```

There are a few things you get by doing this:

- A definition of your API's shape in one place using TypeScript's type system.
- A check that you've only implemented endpoints that are in the API definition.
- Types for route parameters (via TypeScript 4.1's template literal types)
- A check that each endpoint's implementation returns a Promise for the
  expected response type.

While not required, it's not much extra work to get runtime request validation
and this is highly recommended. See below.

## Type-safe API usage

In your client-side code, you can make type-safe API requests:

```ts
import {typedApi} from 'typed-router';
import {API} from './api';

const api = typedApi<API>();
const getUserById = api.get('/users/:userId');
const createUser = api.post('/users');

async function demo () {
  const newUser = await createUser({}, {
    id: 'fred',
    name: 'Fred Flinstone'
  });  // Request body is type checked

  const user = await getUserById({userId: 'fred'});
  // Route parameters are type checked!
  // user's TypeScript type is User
  console.log(user.name);
}
```

This uses the `fetch` API under the hood, but you can plug in your own fetch
function if you need to pass extra headers or prefer to use Axios.

## Bells and Whistles

### Runtime request validation

To ensure that your users hit API endpoints with the correct payloads, use
typescript-json-schema to convert your API definition to JSON Schema:

    typescript-json-schema --required --strictNullChecks api.ts API --out api.schema.json

Then pass this to the `TypeRouter` when you create it in `server.ts`:

```ts
const apiSchema = require('./api.schema.json');
const typedRouter = new TypedRouter<API>(app, apiSchema);
```

Now if the user hits an API endpoint with an incorrect payload, they'll get a
friendly error message:

    $ http POST :/user
    example here

You now have two representations of your API: `api.ts` and `api.schema.json`.
The recommended way to keep them in sync is to run `typescript-json-schema` as
part of your continuous integration workflow and fail if there are any diffs.
The TypeScript definition (`api.ts`) is the source of truth, not the JSON
Schema (`api.schema.json`).

### Error handling

You may `throw` an `HTTPError` in a handler to produce an error response.
In `users.ts`:

```ts
import {API} from './api';
import {TypedRouter, HTTPError} from 'typed-router';

function getUserById(userId: string): User | null {
  // ...
}

export function registerAPI(router: TypedRouter<API>) {
  router.get('/users/:userId', async ({userId}) => {
    const user = getUserById(userId);
    if (!user) {
      throw new HTTPError(404, `No such user ${userId}`);
    }
    return user;
  });
}
```

### Verifying implementation completeness

With JSON Schema for your API (see above), the typed router can also check
that you've implemented all the endpoints you declared. In `server.ts`:

```ts
const apiSchema = require('./api.schema.json');
const typedRouter = new TypedRouter<API>(app, apiSchema);
registerAPI(typedRouter);
typedRouter.assertAllRoutesRegistered();
// will throw unless all endpoints are registered
```

### Generating API docs

You can convert your API definition into Swagger form to get interactive
HTML documentation.

First, install `swagger-ui-express`:

    yarn add swagger-ui-express

Then convert your API schema to Open API format and serve it up:

```ts
import swaggerUI from 'swagger-ui-express';
import {TypedRouter, apiSpecToOpenApi} from 'typed-router';

app.use('/docs', swaggerUI.serve, swaggerUI.setup(apiSpecToOpenApi(apiSchema)));
```

Then visit `/docs`. You may need to pass some additional options to
`apiSpecToOpenApi` to get query execution from the Swagger docs to work.

## TODO

- [ ] Write unit tests
- [ ] Add helper methods for all HTTP verbs
- [ ] Look into cleaning up generics
- [ ] Decide on a name (ts-eliot?)
- [ ] Figure out how to handle `@types` deps (peer deps?)
- [ ] Decide on a parameter ordering for methods
- [ ] Options for request logging
- [x] Should TypedRouter be a class ~or a function~?
- [x] Plug into cityci
- [x] Add a check that all endpoints are implemented
- [x] Make a demo project, maybe TODO or based on GraphQL demo
- [x] Add helpers for constructing URLs
- [x] Look into generating API docs, e.g. w/ Swagger
- [x] Make the runtime validation part optional
- [x] Plug in TS 4.1 template literal types
