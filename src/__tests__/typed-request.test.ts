import {assert as assertType, _} from 'spec.ts';

import {API, User} from './api';
import {typedApi, apiUrlMaker, fetchJson} from '..';
import {Endpoint} from '../api-spec';

describe('typed requests', () => {
  describe('apiUrlMaker', () => {
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
  });

  describe('typed API', () => {
    it('should generate GET requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});
      const getUsers = api.get('/users');
      const getUserById = api.get('/users/:userId');

      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const users = await getUsers();
      assertType(users, _ as {users: User[]});
      expect(users).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'get', null, null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const user = await getUserById({userId: 'fred'});
      assertType(user, _ as User);
      expect(user).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users/fred', 'get', null, null);
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
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {name: 'Fred', age: 42}, null);
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
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {name: 'Fred', age: 42}, null);
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
