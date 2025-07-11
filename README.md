# Crosswalk: safe routes for Express and TypeScript

[![codecov](https://codecov.io/gh/danvk/crosswalk/branch/master/graph/badge.svg?token=L4VL0FB46U)](https://codecov.io/gh/danvk/crosswalk)

This library helps you build type-safe REST APIs using Express using
TypeScript.

Here's what you have to do:

- Define your API using TypeScript types (see below).
- Run `ts-json-schema-generator` to produce a JSON Schema for your API.

Here's what you get in return:

- Type-safe API implementations (for your server)
- Type-safe API requests (for your client code)
- Runtime request validation (for your server, using [ajv][])
- Interactive API documentation (via [swagger-ui-express][suie])

Requirements:

- TypeScript 4.1+
- Express

There is an optional requirement of [`ts-json-schema-generator`][tsjs] if you
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
    get: GetEndpoint<UsersResponse, {query?: string}>;  // Response/query parameter types
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
  router.get('/users', async ({}, req, res, {query}) => filterUsersByName(users, query));
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
- Types for query parameters (and automatic coercion of non-string parameters)
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
const getUserByIdUrl = urlMaker('/users/:userId');
const fredUrl = getUserByIdUrl({userId: 'fred'});
// /api/v0/users/fred
const userUrl = urlMaker('/users');
const fredSearchUrl = userUrl(null, {query: 'fred'});
// /api/v0/users?query=fred
```

## Runtime request validation

To ensure that your users hit API endpoints with the correct payloads, use
`ts-json-schema-generator` to convert your API definition to JSON Schema:

    ts-json-schema-generator --no-ref-encode --no-top-ref --path api.ts API --out api.schema.json

Then pass this to the `TypeRouter` when you create it in `server.ts`:

```ts
const apiSchema = require('./api.schema.json');
const typedRouter = new TypedRouter<API>(app, apiSchema);
```

Now if the user hits an API endpoint with an incorrect payload, they'll get a
friendly error message:

    $ http POST :/user name="Fred"
    {
        error: `data should have required property 'age'`,
    }

You now have two representations of your API: `api.ts` and `api.schema.json`.
The recommended way to keep them in sync is to run `ts-json-schema-generator` as
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

### Route-aware middleware

Express middlware runs before you know which route is going to match.
This means that you can't access route params, or the path that was matched.
You _can_ access these properties if you register a [`finish`][finish] handler, but by that point
the request has been served and you can't do anything about it.

crosswalk lets you register middleware that runs after a route has been matched, but before the
request has been handled. This is often a convenient place to apply access controls.

For example:

```ts
typedRouter.useRouterMiddleware((req, res, next) => {
  const {params} = req;
  if ('userId' in params && params.userId === 'badguy') {
    res.status(403).send('Forbidden');
  } else {
    next();
  }
});
```

You can also access `req.route` in this context.
For example, `req.route.path` might be `/users/:userId` in the previous example.

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

## Options

The `TypedRouter` class takes the following options.

### invalidRequestHandler

By default, if request validation fails, crosswalk returns a 400 status code and a descriptive
error. If you'd like to do something else, you may specify your own `invalidRequestHandler`. For
example, you might like to log the error or omit validation details from the response in prod.

This is the default implementation (`crosswalk.defaultInvalidRequestHandler`):

```ts
new TypedRouter<API>(app, apiSchema, {
  handleInvalidRequest({response, payload, ajv, errors}) {
    response.status(400).json({
      error: ajv.errorsText(errors),
      errors,
      invalidRequest: payload,
    });
  }
});
```

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
and for TypeScript. If running `ts-json-schema-generator` bothers you, you might
want to look into [iots][] or [zod][].

**How do I keep `api.ts` and `api.schema.json` in sync?**

I recommend adding a check to your continuous integration system that runs
`typescript-json-schema` and then `git diff` to make sure there are no changes.
You could also do this as a prepush or precommit hook.

**How do I use middleware with this?**

crosswalk is a thin wrapper around calling `app.get`, `app.post`, etc. Your middleware should work exactly as it did without crosswalk.

**How do I register my API under a prefix?**

Make a new router, wrap it with `TypedRouter`, and mount it wherever you like:

```ts
const app = express();
const rawApiRouter = express.Router();
const apiRouter = new TypedRouter<API>(rawApiRouter, apiJsonSchema);
// ... register API endpoints ...
apiRouter.assertAllRoutesRegistered();
app.use('/api/v0', rawApiRouter);
```

**Why does this require TypeScript 4.1 or later?**

Because it has a hard dependency on [template literal types][ts41]. These are
used to [generate types based on Express paths][tweet].

If you get errors about `Type 'any' is not assignable to type 'never'.`, it
might be because you're using an old version of TypeScript, either in your
project or in your editor.

**Should I set `--additional-properties` with `ts-json-schema-generator`?**

There are many options you can set when you run [`ts-json-schema-generator`][tsjs]. You should think
carefully about these as they have an impact on the runtime behavior of your code.

The `--additional-properties` option is more interesting. TypeScript uses a "structural" or "duck" typing
system. This means that an object may have the declared properties in its type, _but it could have
others, too_!

```ts
interface Hero {
  heroName: string;
}
const superman = {
  heroName: 'Superman',
  alterEgo: 'Clark Kent',
};

declare function getHeroDetails(hero: Hero): string;
getHeroDetails(superman);  // ok!
```

This is simply the way that TypeScript works, and so it must be the way that crosswalk statically
enforces your request types. If you're comfortable with this behavior, set `--additional-properties`.

If you _do not_ specify `--additional-properties`, additional properties on a request will result in the request
being rejected at runtime with a 400 HTTP response. This has pros and cons. The pros are that it
will catch more user errors (e.g. misspelling an optional property name) and allows the server to
be more confident about the shape of its input (`Object.keys` won't produce surprises). The con
is that your runtime behavior is divergent from the static type checking, so client code that
passes the type checker might produce failing requests at runtime. Until TypeScript gets
["exact" types][exact], it will not be able to fully model `--additional-properties=false` statically.

**What's with the name?**

A crosswalk is a _safe route_ across a road. Also a nod to [Sidewalk Labs][swl],
where this project was originally developed.

## Related projects

- [GraphQL][] achieves type-safe APIs by ditching the REST structure altogether. If you want to use GraphQL, there are many tools to help, e.g. [Apollo][].
- [swagger-typescript-api][] starts with a Swagger (OpenAPI) schema as a source of truth and generates TypeScript types from it (crosswalk does the reverse).
- [blitzjs][] and [trpc][] also give you end-to-end type safety, but without modeling a REST API explicitly in the way that crosswalk does.

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

[tsjs]: https://github.com/vega/ts-json-schema-generator
[ajv]: https://ajv.js.org/
[1]: https://effectivetypescript.com/2020/07/27/safe-queryselector/
[zod]: https://github.com/colinhacks/zod
[iots]: https://github.com/gcanti/io-ts
[demo]: https://github.com/danvk/crosswalk-demo
[suie]: https://github.com/scottie1984/swagger-ui-express
[ts41]: https://devblogs.microsoft.com/typescript/announcing-typescript-4-1
[tweet]: https://twitter.com/danvdk/status/1301707026507198464
[swl]: https://sidewalklabs.com/
[exact]: https://github.com/microsoft/TypeScript/issues/12936
[swagger-typescript-api]: https://github.com/acacode/swagger-typescript-api
[trpc]: https://github.com/trpc/trpc
[blitzjs]: https://blitzjs.com/
[graphql]: https://graphql.org/
[apollo]: https://www.apollographql.com/
[finish]: https://nodejs.org/api/http.html#http_event_finish

## File Upload (multipart/form-data) Support

Crosswalk supports type-safe file upload endpoints using `multipart/form-data` and integrates smoothly with middleware like [multer](https://github.com/expressjs/multer).

### How to Define File Upload Endpoints

1. **Mark file fields in your API spec:**
   - Use a type file that conforms to `{__type: 'file'}` interface to indicate file field in the form.
   - Use MultipartEndpoint.
   - Example:

```ts
// api-spec.ts
export type File = {__type: 'file'};

export interface API {
  '/upload': {
    post: MultipartEndpoint<{ file: File; description: string }, { success: boolean }>;
  };
}
```

2. **Implement the endpoint using multer:**
   - Register a route-aware middleware for the upload endpoint that uses `multer` to handle file parsing.
   - In your handler, access the file via `req.file` and the rest of the form data via `req.body`.

```ts
import multer from 'multer';
const upload = multer({ storage: multer.memoryStorage() });

router.useRouterMiddleware((req, res, next) => {
  if (req.route.path === '/upload' && req.method === 'POST') {
    upload.single('file')(req as any, res as any, () => {
      // Optionally inject a dummy value for the file field so validation passes
      if (req.file) req.body.file = 'uploaded';
      next();
    });
  } else {
    next();
  }
});

router.post('/upload', async (_, body, req) => {
  const file = req.file;
  return {
    success: true,
    filename: file?.originalname || 'unknown.txt',
    size: file?.size || 0,
  };
});
```

### How Validation Works
- For `multipart/form-data` endpoints, Crosswalk automatically removes all fields of type `File` from the request body before validation.
- This allows you to use type-safe request validation for the rest of the form fields, while letting `multer` handle the file(s).
- In your handler, the `body` parameter will only include non-file fields; use `req.file` or `req.files` for the uploaded file(s).

### OpenAPI/Swagger Generation
- File fields are automatically documented as `type: string, format: binary` in the generated OpenAPI 3.0 schema.
- Example:

```yaml
requestBody:
  content:
    multipart/form-data:
      schema:
        type: object
        properties:
          file:
            type: string
            format: binary
          description:
            type: string
```

