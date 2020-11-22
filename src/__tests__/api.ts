import {Endpoint, GetEndpoint} from '../api-spec';

export interface User {
  id: string;
  name: string;
  age: number;
}

export type CreateUserRequest = Pick<User, 'name' | 'age'>;

export interface API {
  '/users': {
    /** Get the full list of users */
    get: GetEndpoint<{users: User[]}>;
    /** Create a new user */
    post: Endpoint<CreateUserRequest, User>;
  };
  '/users/:userId': {
    get: GetEndpoint<User>;
    /** Edit an existing user */
    patch: Endpoint<Partial<CreateUserRequest>, User>;
    put: Endpoint<{name?: string; age?: number}, User>;
    delete: Endpoint<{}, User>;
  };
}
