import {API} from './api';
import {TypedRouter, apiUrlMaker} from '..';

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

      // @ts-expect-error
      urlMaker('/users/:userId')({notUserId: 'fred'});
      // @ts-expect-error
      urlMaker('/users')({notUserId: 'fred'});
    });
  });
});
