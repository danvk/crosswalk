import {Endpoint, GetEndpoint} from '../api-spec';

export interface User {
  id: string;
  name: string;
  age: number;
}

export type CreateUserRequest = Pick<User, 'name' | 'age'>;

export interface API {
  '/random': {
    /** Get a random number */
    get: GetEndpoint<{random: number}>;
  };
  '/users': {
    /** Get the full list of users */
    get: GetEndpoint<{users: User[]}, {nameIncludes?: string; minAge?: number}>;
    /** Create a new user */
    post: Endpoint<CreateUserRequest, User>;
  };
  '/users/:userId': {
    get: GetEndpoint<User, {firstName?: string}>;
    /** Edit an existing user */
    patch: Endpoint<Partial<CreateUserRequest>, User>;
    put: Endpoint<{name?: string; age?: number}, User>;
    delete: Endpoint<{}, User>;
  };
}
