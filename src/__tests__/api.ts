import {Endpoint, GetEndpoint} from '../api-spec';

export interface User {
  id: string;
  name: string;
  suffix?: string;
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
    post: Endpoint<CreateUserRequest, User, {nameIncludes?: string; suffix?: string}>;
  };
  '/users/:userId': {
    get: GetEndpoint<User, {firstName?: string}>;
    /** Edit an existing user */
    patch: Endpoint<Partial<CreateUserRequest>, User>;
    put: Endpoint<{name?: string; age?: number}, User>;
    delete: Endpoint<{}, User>;
  };
  '/complex': {
    // This endpoint references an interface from an inline type, see issue #10.
    post: Endpoint<{user: User | null}, User>;
    // This endpoint is used to test that intersection types work as expected.
    patch: Endpoint<CreateUserRequest & {id: string}, User>;
  };
}
