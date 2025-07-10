import {Endpoint, GetEndpoint, MultipartEndpoint, File} from '../api-spec';

export interface User {
  id: string;
  name: string;
  suffix?: string;
  age: number;
  phoneNumbers: PhoneNumber[];
  permanentAddress: Address;
  role: 'user';
  signupMethod?: 'email';
  fromSystem?: 'google' | null;
}

export type CreateUserRequest = Pick<
  User,
  'name' | 'age' | 'phoneNumbers' | 'permanentAddress'
>;

export interface PhoneNumber {
  number: string;
  type: 'home' | 'work' | 'mobile' | null;
}

export interface Address {
  street: string;
  city: string;
  state: string;
  zip: string;
  location: Location;
}

export interface Location {
  latitude: number;
  longitude: number;
}

export interface FileUpload {
  source: string;
  file: File;
}

export interface QueryParams {
  createdAt?: string;
}

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
    put: Endpoint<
      {name?: string; age?: number; phoneNumbers?: PhoneNumber[]; permanentAddress?: Address},
      User
    >;
    delete: Endpoint<{}, User>;
  };
  '/complex': {
    // This endpoint references an interface from an inline type, see issue #10.
    post: Endpoint<{user: User | null}, User, QueryParams>;
    // This endpoint is used to test that intersection types work as expected.
    patch: Endpoint<CreateUserRequest & {id: string}, User>;
  };
  '/search': {
    // This endpoint has mandatory query parameters
    get: GetEndpoint<{users: User[]}, {query: string; numResults?: number}>;
  };
  '/upload': {
    /** Upload a single file */
    post: MultipartEndpoint<FileUpload, {success: boolean; filename: string; size: number}>;
  };
}
