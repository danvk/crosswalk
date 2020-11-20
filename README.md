# Crosswalk: safe routes for Express and TypeScript

This library helps you build type-safe REST APIs using Express using
TypeScript.

Here's what you have to do:

- Define your API using TypeScript types (see below).
- Run `typescript-json-schema` to produce a JSON Schema for your API.

Here's what you get in return:

- Type-safe API implementations (for your server)
- Type-safe API requests (for your client code)
- Runtime request validation (for your server, using [ajv][])
- Interactive API documentation (via [swagger-ui-express][suie])

Requirements:

- TypeScript 4.1+
- Express

There is an optional requirement of [`typescript-json-schema`][tsjs] if you
want runtime request validation or API docs. (You probably do!)

For a full example of a project using crosswalk, see this [demo repo][demo].

## Usage

First install `crosswalk` and its peer dependencies (if you haven't already):

    # if needed
    npm install express
    npm install -D typescript @types/express

    npm install crosswalk

Then define your API in `api.ts`:

```ts
import type {Endpoint, GetEndpoint} from 'crosswalk/dist/api-spec';

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
import {TypedRouter} from 'crosswalk';

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
and this is highly recommended. See "Runtime request validation" below.

For a complete example, check out the [crosswalk-demo repo][demo].

## Type-safe API usage

In your client-side code, you can make type-safe API requests:

```ts
import {typedApi} from 'crosswalk';
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

You can also construct API URLs for mocking or requesting yourself. The path
parameters will be type checked. No more `/path/to/undefined/null`!

```ts
import {apiUrlMaker} from 'crosswalk';
const urlMaker = apiUrlMaker<API>('/api/v0');
const getUserUrl = urlMaker('/users/:userId');
const fredUrl = getUserUrl({userId: 'fred'});
// /api/v0/users/fred
```

## Runtime request validation

To ensure that your users hit API endpoints with the correct payloads, use
`typescript-json-schema` to convert your API definition to JSON Schema:

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

## Bells and Whistles

### Error handling

You may `throw` an `HTTPError` in a handler to produce an error response.
In `users.ts`:

```ts
import {API} from './api';
import {TypedRouter, HTTPError} from 'crosswalk';

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
import {TypedRouter, apiSpecToOpenApi} from 'crosswalk';

app.use('/docs', swaggerUI.serve, swaggerUI.setup(apiSpecToOpenApi(apiSchema)));
```

Then visit `/docs`. You may need to pass some additional options to
`apiSpecToOpenApi` to get query execution from the Swagger docs to work.

## Questions

**GraphQL has types, why not use that?**

If you want to use GraphQL, that's great! Go for it! But there are many reasons
that REST APIs are still around. If you're already using REST and want to get
type safety without havin to do a full GraphQL conversion, then Crosswalk can
help.

**Why do I have to define my API in TypeScript _and_ JSON Schema?**

[TypeScript types get erased at runtime][1], so if you want to use TypeScript
types as your source of truth, you need to have some way of accessing them at
runtime. For Crosswalk, that way is JSON Schema. This is a convenient form
since there are many JSON Schema validators (such as [ajv][]) and JSON Schema
is also used by OpenAPI, which makes it easy to generate documentation.

Why not use JSON Schema as the source of truth? Some developers choose to do
this, but personally I find TypeScript's type declaration syntax much
friendlier to use. And you'd still need some way to get TypeScript types out
of it to get static type checking.

There are several tools for defining types that are available both at runtime
and for TypeScript. If running `typescript-json-schema` bothers you, you might
want to look into [iots][] or [zod][].

**How do I keep `api.ts` and `api.schema.json` in sync?**

I recommend adding a check to your continuous integration system that runs
`typescript-json-schema` and then `git diff` to make sure there are no changes.
You could also do this as a prepush or precommit hook.

**Why does this require TypeScript 4.1 or later?**

Because it has a hard dependency on [template literal types][ts41]. These are
used to [generate types based on Express paths][tweet].

If you get errors about `Type 'any' is not assignable to type 'never'.`, it
might be because you're using an old version of TypeScript, either in your
project or in your editor.

**What's with the name?**

A crosswalk is a _safe route_ across a road. Also a nod to [Sidewalk Labs][swl],
where this project was originally developed.

## Development setup

After cloning, run:

    yarn

You may get some warnings about peer dependencies, but these can be ignored.

Then:

    yarn test
    yarn test --coverage

To test with the [demo repo][demo],

    yarn tsc
    cd ../crosswalk-demo
    yarn add ../crosswalk

To publish:

    yarn tsc
    yarn publish

## TODO

- [ ] Add helper methods for all HTTP verbs
- [ ] Look into cleaning up generics
- [ ] Options for request logging
- [ ] Set up prettier (doesn't support TS 4.1 yet), eslint, CI
- [ ] Add an option for more express-like callbacks (w/ only request, response)
- [ ] Support fancier paths
- [x] Set up better type tests
- [x] Narrow types of request.params, request.body in handlers
- [x] Write unit tests
- [x] Decide on a name
- [x] Figure out how to handle `@types` deps (peer deps?)
- [x] Decide on a parameter ordering for methods
- [x] Should TypedRouter be a class ~or a function~?
- [x] Plug into cityci
- [x] Add a check that all endpoints are implemented
- [x] Make a demo project, maybe TODO or based on GraphQL demo
- [x] Add helpers for constructing URLs
- [x] Look into generating API docs, e.g. w/ Swagger
- [x] Make the runtime validation part optional
- [x] Plug in TS 4.1 template literal types

[tsjs]: https://github.com/YousefED/typescript-json-schema
[ajv]: https://ajv.js.org/
[1]: https://effectivetypescript.com/2020/07/27/safe-queryselector/
[zod]: https://github.com/colinhacks/zod
[iots]: https://github.com/gcanti/io-ts
[demo]: https://github.com/danvk/crosswalk-demo
[suie]: https://github.com/scottie1984/swagger-ui-express
[ts41]: https://devblogs.microsoft.com/typescript/announcing-typescript-4-1
[tweet]: https://twitter.com/danvdk/status/1301707026507198464
[swl]: https://sidewalklabs.com/
