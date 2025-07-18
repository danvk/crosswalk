import {API} from './api';
import {typedApi, apiUrlMaker, fetchJson} from '..';
import {Endpoint, GetEndpoint} from '../api-spec';

describe('typed requests', () => {
  describe('apiUrlMaker', () => {
    it('should assume GET when there are multiple methods for an endpoint', () => {
      const urlMaker = apiUrlMaker<API>();
      const getUsers = urlMaker('/users');
      //    ^? const getUsers: (params?: {
      //           readonly [x: string]: never;
      //       } | null | undefined, query?: {
      //           readonly nameIncludes?: string | undefined;
      //           readonly minAge?: number | undefined;
      //       } | undefined) => string

      // @ts-expect-error no path parameters are allowed
      getUsers({param: 'value'});

      // If no method is specified, assume GET
      const getUser = urlMaker('/users/:userId');
      //    ^? const getUser: (params: {
      //           readonly userId: string;
      //       }, query?: {
      //           readonly firstName?: string | undefined;
      //       } | undefined) => string

      // @ts-expect-error second param needs to be firstName, not nameIncludes
      getUser({userId: 'fred'}, {nameIncludes: 'fred'});
    });

    it('should assume GET with query param types that intersect', () => {
      interface API {
        '/endpoint': {
          get: GetEndpoint<{}, {a?: string; b?: 'b1' | 'b2'}>;
          post: Endpoint<{}, {}, {b?: 'b2' | 'b3'; c?: string}>;
        };
      }

      const urlMaker = apiUrlMaker<API>('/api');
      const endpointUrl = urlMaker('/endpoint');
      // OK, assumes GET
      endpointUrl({}, {a: 'a', b: 'b1'});

      // OK, assumes GET and 'b1' works for get
      expect(endpointUrl({}, {b: 'b1'})).toEqual('/api/endpoint?b=b1');
      // @ts-expect-error 'b3' only works for post
      expect(endpointUrl({}, {b: 'b3'})).toEqual('/api/endpoint?b=b3');

      // 'b2' is safe for each method
      expect(endpointUrl({}, {b: 'b2'})).toEqual('/api/endpoint?b=b2');

      // No parameter forms are OK, too, since there are no mandatory query params
      expect(endpointUrl()).toEqual('/api/endpoint');
      expect(endpointUrl(null)).toEqual('/api/endpoint');
      expect(endpointUrl({})).toEqual('/api/endpoint');
      expect(endpointUrl(null, {})).toEqual('/api/endpoint');

      // It's fine to specify GET explicitly
      expect(urlMaker('/endpoint', 'get')({}, {a: 'a', b: 'b1'})).toEqual(
        '/api/endpoint?a=a&b=b1',
      );

      // It's also fine to specify POST explicitly
      // @ts-expect-error b1 is only allowed for GET
      expect(urlMaker('/endpoint', 'post')({}, {a: 'a', b: 'b1'})).toEqual(
        '/api/endpoint?a=a&b=b1',
      );

      expect(urlMaker('/endpoint', 'post')({}, {c: 'c', b: 'b3'})).toEqual(
        '/api/endpoint?c=c&b=b3',
      );
    });

    it('should generate URLs without path params', () => {
      const urlMaker = apiUrlMaker<API>();
      expect(urlMaker('/users')()).toEqual('/users');
    });

    it('should generate URLs with a prefix', () => {
      const urlMaker = apiUrlMaker<API>('/api/v0');
      expect(urlMaker('/users')()).toEqual('/api/v0/users');
    });

    it('should generate URLs with path params', () => {
      const urlMaker = apiUrlMaker<API>('/api/v0');
      expect(urlMaker('/users/:userId')({userId: 'fred'})).toEqual('/api/v0/users/fred');

      expect(() => {
        // @ts-expect-error needs userId param
        urlMaker('/users/:userId')({notUserId: 'fred'});
      }).toThrowError();

      // @ts-expect-error no params
      urlMaker('/users')({notUserId: 'fred'});
    });

    it('should accept readonly path params', () => {
      const user = {userId: 'fred'} as const;
      //    ^? const user: { readonly userId: "fred"; }

      const urlMaker = apiUrlMaker<API>('/api/v0');
      expect(urlMaker('/users/:userId')(user)).toEqual('/api/v0/users/fred');
    });

    it('should generate URLs with query params', () => {
      const urlMaker = apiUrlMaker<API>();
      expect(urlMaker('/users', 'get')({}, {nameIncludes: 'Fre', minAge: 40})).toEqual(
        '/users?nameIncludes=Fre&minAge=40',
      );
      expect(urlMaker('/users', 'post')({}, {suffix: 'Jr.'})).toEqual('/users?suffix=Jr.');

      // @ts-expect-error suffix isn't available on GET so it isn't allowed w/o an explicit verb.
      urlMaker('/users')(null, {suffix: 'Jr.'});
    });

    it('should generate URLs with mandatory query params', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {mandatory: string}>;
          post: Endpoint<{}, {}, {mandatory2: string}>;
        };
      }

      // With no HTTP method specified, assume GET
      const urlMakerAssumesGet = apiUrlMaker<TestAPI>()('/path');
      //    ^? const urlMakerAssumesGet: (params: {
      //           readonly [x: string]: never;
      //       } | null, query: {
      //           readonly mandatory: string;
      //       }) => string

      // Failing to specify a mandatory query parameter is an error.
      // @ts-expect-error has mandatory query param
      urlMakerAssumesGet();
      // @ts-expect-error has mandatory query param
      urlMakerAssumesGet({});
      // @ts-expect-error has mandatory query param
      urlMakerAssumesGet({}, {});

      // @ts-expect-error mandatory2 is only allowed on POST, but we assume GET.
      expect(urlMakerAssumesGet(null, {mandatory: 'a', mandatory2: 'b'})).toEqual(
        '/path?mandatory=a&mandatory2=b',
      );

      // It's fine to specify GET explicitly.
      const urlMakerGet = apiUrlMaker<TestAPI>()('/path', 'get');
      //    ^? const urlMakerGet: (params: {
      //           readonly [x: string]: never;
      //       } | null, query: {
      //           readonly mandatory: string;
      //       }) => string
      expect(urlMakerGet(null, {mandatory: 'a'})).toEqual('/path?mandatory=a');

      // It's also fine to specify POST explicitly.
      const urlMakerPost = apiUrlMaker<TestAPI>()('/path', 'post');
      //    ^? const urlMakerPost: (params: {
      //           readonly [x: string]: never;
      //       } | null, query: {
      //           readonly mandatory2: string;
      //       }) => string
      expect(urlMakerPost(null, {mandatory2: 'b'})).toEqual('/path?mandatory2=b');
    });

    it('should error on URLs even with intersecting keys', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {a: string}>;
          post: Endpoint<{}, {}, {a?: string; mandatory2: string}>;
        };
      }

      // "a" is mandatory for GET. Since we assume GET, it should be mandatory here, too.
      const urlMakerAssumesGet = apiUrlMaker<TestAPI>()('/path');
      //    ^? const urlMakerAssumesGet: (params: {
      //           readonly [x: string]: never;
      //       } | null, query: {
      //           readonly a: string;
      //       }) => string

      // @ts-expect-error Excess property checking applies here so mandatory2 is not allowed.
      expect(urlMakerAssumesGet(null, {a: 'a', mandatory2: 'b'})).toEqual(
        '/path?a=a&mandatory2=b',
      );
      // @ts-expect-error there's a mandatory query parameter (a)
      expect(urlMakerAssumesGet(null)).toEqual('/path');
    });

    it('should handle mixed optional/required query params', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {a: string; b?: string; c?: string}>;
          post: Endpoint<{}, {}, {a?: string; b: string; c?: string}>;
        };
      }

      // No explicit method means "assume get".
      const urlMakerAssumesGet = apiUrlMaker<TestAPI>()('/path');
      //    ^? const urlMakerAssumesGet: (params: {
      //           readonly [x: string]: never;
      //       } | null, query: {
      //           readonly a: string;
      //           readonly b?: string | undefined;
      //           readonly c?: string | undefined;
      //       }) => string
      expect(urlMakerAssumesGet(null, {a: 'a', b: 'b', c: 'c'})).toEqual('/path?a=a&b=b&c=c');
    });

    it('should fail to produce URLs without a method when there is no GET', () => {
      interface TestAPI {
        '/path': {
          put: GetEndpoint<{}, {a: string; b?: string; c?: string}>;
          post: Endpoint<{}, {}, {a?: string; b: string; c?: string}>;
        };
      }

      // No explicit method means "assume get", but there is no GET.
      // Ideal behavior here would be to error if any method has mandatory query params.
      const urlMakerAssumesGet = apiUrlMaker<TestAPI>()('/path');
      expect(urlMakerAssumesGet()).toEqual('/path');

      const urlMakerPut = apiUrlMaker<TestAPI>()('/path', 'put');
      // @ts-expect-error PUT /path has a mandatory query parameter
      expect(urlMakerPut()).toEqual('/path');
      expect(urlMakerPut(null, {a: 'a'})).toEqual('/path?a=a');
    });

    it('should ignore query strings for endpoints without them', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{names: string[]}>;
          post: Endpoint<{name: string}, {name: string}>;
        };
        '/path/:pathId': {
          get: GetEndpoint<{name: string}>;
          post: Endpoint<{name: string}, {name: string}>;
        };
      }

      const urlMaker = apiUrlMaker<TestAPI>()('/path');
      expect(urlMaker()).toEqual('/path');
      const urlMakerId = apiUrlMaker<TestAPI>()('/path/:pathId');
      expect(urlMakerId({pathId: 'foo'})).toEqual('/path/foo');

      // @ts-expect-error no query parameters are supported
      urlMakerId({pathId: 'foo'}, {q: 'param'});
    });
  });

  describe('default fetch implementation', () => {
    let mockFetch: jest.Mock;
    beforeEach(() => {
      mockFetch = jest.fn();
      global.fetch = mockFetch;
    });

    it('should have correct request data', async () => {
      const api = typedApi<API>();
      const getUsers = api.get('/users');

      mockFetch.mockReturnValueOnce(
        Promise.resolve({json: () => Promise.resolve({users: []})}),
      );

      const users = await getUsers({}, {minAge: 42});
      //    ^? const users: { users: User[]; }
      expect(users).toEqual({users: []});
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/users?minAge=42', {
        method: 'get',
        body: 'null',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
      });
    });
  });

  describe('typed API', () => {
    it('should generate GET requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});
      const getRandom = api.get('/random');
      const getUsers = api.get('/users');
      const getUserById = api.get('/users/:userId');

      mockFetcher.mockReturnValueOnce(Promise.resolve({random: 7}));
      const random = await getRandom();
      //    ^? const random: { random: number; }
      expect(random).toEqual({random: 7});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/random', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const allUsers = await getUsers();
      //    ^? const allUsers: { users: User[]; }
      expect(allUsers).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const filteredUsers = await getUsers({}, {nameIncludes: 'red'});
      //    ^? const filteredUsers: { users: User[]; }
      expect(filteredUsers).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users?nameIncludes=red', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const user = await getUserById({userId: 'fred'});
      //    ^? const user: User
      expect(user).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users/fred', 'get', null);
    });

    it('should generate POST requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});

      const createUser = api.post('/users');

      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const newUser = await createUser(
        //    ^? const newUser: User

        {},
        {
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
        },
      );
      expect(newUser).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {
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
      });
    });

    it('should generate POST requests with query parameters', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});

      const createUser = api.post('/users');

      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const newUser = await createUser(
        //    ^? const newUser: User
        {},
        {
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
        },
        {suffix: 'sr'},
      );
      expect(newUser).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users?suffix=sr', 'post', {
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
      });
    });

    it('should generate GET requests with mandatory query parameters', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});
      const getSearch = api.get('/search');

      mockFetcher.mockReturnValue(Promise.resolve({users: []}));

      // @ts-expect-error "query" query param is required
      getSearch();
      // @ts-expect-error "query" query param is required
      getSearch(null);

      const users = await getSearch(null, {query: 'fred'});
      //    ^? const users: { users: User[]; }
      expect(users).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(3);
      expect(mockFetcher).toHaveBeenLastCalledWith('/search?query=fred', 'get', null);
    });

    it('should accept readonly objects in POST requests', async () => {
      interface APIWithDeepObject {
        '/foo': {
          post: Endpoint<{foo: {bar: string[]}}, {baz: string}>;
        };
      }

      const mockFetcher = jest.fn();
      const api = typedApi<APIWithDeepObject>({fetch: mockFetcher});

      const createFoo = api.post('/foo');
      const readonlyFoo = {foo: {bar: ['baz', 'quux']}} as const;
      // @ts-expect-error cannot assign to readonly property
      readonlyFoo.foo.bar[0] = 'foo';
      mockFetcher.mockReturnValueOnce({baz: 'bar'});
      const fooResponse = await createFoo({}, readonlyFoo);
      //    ^? const fooResponse: { baz: string; }

      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // It's OK to modify the response.
      expect(fooResponse).toEqual({baz: 'bar'});
      fooResponse.baz = 'foo';
    });

    it('should have a reasonable default fetcher', async () => {
      const fetchMock = jest.fn(() =>
        Promise.resolve({
          json: () => Promise.resolve({hello: 'fetch'}),
        }),
      );
      (global as any).fetch = fetchMock;
      expect(await fetchJson('/api/v0/hello', 'get', {payload: 42})).toEqual({hello: 'fetch'});
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(fetchMock).toHaveBeenCalledWith('/api/v0/hello', {
        method: 'get',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: `{"payload":42}`,
      });
    });
  });
});
