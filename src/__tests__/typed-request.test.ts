import {assert, assert as assertType, _} from 'spec.ts';

import {API, User} from './api';
import {typedApi, apiUrlMaker, fetchJson} from '..';
import {Endpoint, GetEndpoint} from '../api-spec';

describe('typed requests', () => {
  describe('apiUrlMaker', () => {
    it('should provide an intersection of query params available to all methods for a given endpoint', () => {
      const urlMaker = apiUrlMaker<API>();
      const getUsers = urlMaker('/users');
      assertType(
        _ as typeof getUsers,
        _ as (
          params?: null | {readonly [pathParam: string]: never},
          query?: Readonly<{
            nameIncludes?: string;
          }>,
        ) => string,
      );

      const getUser = urlMaker('/users/:userId');
      assertType(_ as typeof getUser, _ as (params: {readonly userId: string}) => string);

      // @ts-expect-error
      getUser({userId: 'fred'}, {nameIncludes: 'fred'});
    });

    it('should intersect query params as expected', () => {
      interface API {
        '/endpoint': {
          get: GetEndpoint<{}, {a?: string; b?: 'b1' | 'b2'}>;
          post: Endpoint<{}, {}, {b?: 'b2' | 'b3'; c?: string}>;
        };
      }

      const urlMaker = apiUrlMaker<API>('/api');
      const endpointUrl = urlMaker('/endpoint');
      // @ts-expect-error
      endpointUrl({}, {a: 'a', b: 'b'}); // should be an error, we don't know that "a" is OK.

      // @ts-expect-error
      expect(endpointUrl({}, {b: 'b1'})).toEqual('/api/endpoint?b=b1'); // 'b1' only works for get

      // 'b2' is safe for each method
      expect(endpointUrl({}, {b: 'b2'})).toEqual('/api/endpoint?b=b2');

      // @ts-expect-error
      expect(endpointUrl({}, {b: 'b3'})).toEqual('/api/endpoint?b=b3'); // 'b3' only works for post

      // No parameter forms are OK, too, since there are no mandatory query params
      expect(endpointUrl()).toEqual('/api/endpoint');
      expect(endpointUrl(null)).toEqual('/api/endpoint');
      expect(endpointUrl({})).toEqual('/api/endpoint');
      expect(endpointUrl(null, {})).toEqual('/api/endpoint');

      expect(urlMaker('/endpoint', 'get')({}, {a: 'a', b: 'b1'})).toEqual(
        '/api/endpoint?a=a&b=b1',
      ); // fine, we're using get.
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
        // @ts-expect-error
        urlMaker('/users/:userId')({notUserId: 'fred'});
      }).toThrowError();

      // @ts-expect-error
      urlMaker('/users')({notUserId: 'fred'});
    });

    it('should accept readonly path params', () => {
      const user = {userId: 'fred'} as const;
      assertType(user, _ as {readonly userId: 'fred'});

      const urlMaker = apiUrlMaker<API>('/api/v0');
      expect(urlMaker('/users/:userId')(user)).toEqual('/api/v0/users/fred');
    });

    it('should generate URLs with query params', () => {
      const urlMaker = apiUrlMaker<API>();
      expect(urlMaker('/users', 'get')({}, {nameIncludes: 'Fre', minAge: 40})).toEqual(
        '/users?nameIncludes=Fre&minAge=40',
      );
      expect(urlMaker('/users', 'post')({}, {suffix: 'Jr.'})).toEqual('/users?suffix=Jr.');

      // @ts-expect-error suffix is not common to all routes on /users and therefore is not allowed
      urlMaker('/users')(null, {suffix: 'Jr.'});
    });

    it('should generate URLs with mandatory query params', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {mandatory: string}>;
          post: Endpoint<{}, {}, {mandatory2: string}>;
        };
      }

      const urlMakerEither = apiUrlMaker<TestAPI>()('/path');
      assert(
        _ as typeof urlMakerEither,
        _ as (
          error: '❌ Must specify an HTTP method (get, post, etc.) to apiUrlMaker for this endpoint',
          _: never,
        ) => string,
      );
      // @ts-expect-error
      expect(urlMakerEither(null, {mandatory: 'a', mandatory2: 'b'})).toEqual(
        '/path?mandatory=a&mandatory2=b',
      );

      const urlMakerGet = apiUrlMaker<TestAPI>()('/path', 'get');
      assert(
        _ as typeof urlMakerGet,
        _ as (
          params: null | {readonly [pathParam: string]: never},
          query: {
            readonly mandatory: string;
          },
        ) => string,
      );
      expect(urlMakerGet(null, {mandatory: 'a'})).toEqual('/path?mandatory=a');

      const urlMakerPost = apiUrlMaker<TestAPI>()('/path', 'post');
      assert(
        _ as typeof urlMakerPost,
        _ as (
          params: null | {readonly [pathParam: string]: never},
          query: {
            readonly mandatory2: string;
          },
        ) => string,
      );
      expect(urlMakerPost(null, {mandatory2: 'b'})).toEqual('/path?mandatory2=b');
    });

    it('should error on URLs even with intersecting keys', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {a: string}>;
          post: Endpoint<{}, {}, {a?: string; mandatory2: string}>;
        };
      }

      // Even though "a" is allowed for both methods, mandatory2 is not.
      const urlMakerEither = apiUrlMaker<TestAPI>()('/path');
      assert(
        _ as typeof urlMakerEither,
        _ as (
          error: '❌ Must specify an HTTP method (get, post, etc.) to apiUrlMaker for this endpoint',
          _: never,
        ) => string,
      );
      // @ts-expect-error
      expect(urlMakerEither(null, {a: 'a', mandatory2: 'b'})).toEqual(
        '/path?a=a&mandatory2=b',
      );
    });

    it('should turn mixed optional/required query params into required', () => {
      interface TestAPI {
        '/path': {
          get: GetEndpoint<{}, {a: string; b?: string; c?: string}>;
          post: Endpoint<{}, {}, {a?: string; b: string; c?: string}>;
        };
      }

      // a and b should be required unless we know whether we're using get or post.
      const urlMakerEither = apiUrlMaker<TestAPI>()('/path');
      assert(
        _ as typeof urlMakerEither,
        _ as (
          params: null | {readonly [pathParam: string]: never},
          query: {
            readonly a: string;
            readonly b: string;
            readonly c?: string;
          },
        ) => string,
      );
      expect(urlMakerEither(null, {a: 'a', b: 'b', c: 'c'})).toEqual('/path?a=a&b=b&c=c');
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
      assertType(users, _ as {users: User[]});
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
      assertType(random, _ as {random: number});
      expect(random).toEqual({random: 7});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/random', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const allUsers = await getUsers();
      assertType(allUsers, _ as {users: User[]});
      expect(allUsers).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const filteredUsers = await getUsers({}, {nameIncludes: 'red'});
      assertType(filteredUsers, _ as {users: User[]});
      expect(filteredUsers).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users?nameIncludes=red', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const user = await getUserById({userId: 'fred'});
      assertType(user, _ as User);
      expect(user).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users/fred', 'get', null);
    });

    it('should generate POST requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});

      const createUser = api.post('/users');

      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const newUser = await createUser({}, {name: 'Fred', age: 42});
      assertType(newUser, _ as User);
      expect(newUser).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {name: 'Fred', age: 42});
    });

    it('should provide a method-agnostic request method', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});

      const createUser = api.request('post', '/users');

      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const newUser = await createUser({}, {name: 'Fred', age: 42});
      assertType(newUser, _ as User);
      expect(newUser).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {name: 'Fred', age: 42});
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
      // @ts-expect-error
      readonlyFoo.foo.bar[0] = 'foo';
      mockFetcher.mockReturnValueOnce({baz: 'bar'});
      const fooResponse = await createFoo({}, readonlyFoo);

      expect(mockFetcher).toHaveBeenCalledTimes(1);

      // It's OK to modify the response.
      assertType(fooResponse, _ as {baz: string});
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
