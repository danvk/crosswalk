import {API, User} from './api';
import {typedApi, apiUrlMaker} from '..';

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
  });

  describe('typed API', () => {
    it('should generate GET requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});
      const getUsers = api.get('/users');
      const getUserById = api.get('/users/:userId');

      mockFetcher.mockReturnValueOnce(Promise.resolve({users: []}));
      const users: {users: User[]} = await getUsers();
      expect(users).toEqual({users: []});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'get', null);

      mockFetcher.mockClear();
      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const user: User = await getUserById({userId: 'fred'});
      expect(user).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users/fred', 'get', null);
    });

    it('should generate POST requests', async () => {
      const mockFetcher = jest.fn();
      const api = typedApi<API>({fetch: mockFetcher});

      const createUser = api.post('/users');

      mockFetcher.mockReturnValueOnce({id: 'fred', name: 'Fred', age: 42});
      const newUser: User = await createUser({}, {name: 'Fred', age: 42});
      expect(newUser).toEqual({id: 'fred', name: 'Fred', age: 42});
      expect(mockFetcher).toHaveBeenCalledTimes(1);
      expect(mockFetcher).toHaveBeenCalledWith('/users', 'post', {name: 'Fred', age: 42});
    });
  });
});
