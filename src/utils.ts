import {HTTPVerb} from './api-spec';

/** Like T[K], but doesn't require K be assignable to keyof T */
export type SafeKey<T, K extends PropertyKey> = T[K & keyof T];

// TODO: Look into fancier variation from https://ja.nsommer.dk/articles/type-checked-url-router.html
/** Extract params from an express path (e.g. '/students/:studentId'). */
export type ExtractRouteParams<T extends string> = string extends T
  ? Record<string, string>
  : T extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? {[k in Param | keyof ExtractRouteParams<Rest>]: string}
  : T extends `${infer _Start}:${infer Param}`
  ? {[k in Param]: string}
  : {};

// See https://effectivetypescript.com/2020/05/12/unionize-objectify/
export type Unionize<T> = {[k in keyof T]: {k: k; v: T[k]}}[keyof T];

export type Primitive = string | number | boolean | bigint | symbol | undefined | null;

/** Based on ts-essentials, but reduced to only JSON-compatible types */
export type DeepReadonly<T> = T extends Primitive
  ? T
  : T extends {}
  ? {readonly [K in keyof T]: DeepReadonly<T[K]>}
  : Readonly<T>;

export type PathsForMethod<API, Method extends HTTPVerb> = Extract<
  Unionize<API>,
  {v: Record<Method, any>}
>['k'] &
  keyof API &
  string;
