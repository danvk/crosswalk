/** Like T[K], but doesn't require K be assignable to keyof T */
export type SafeKey<T, K extends string> = T[K & keyof T];

// TODO: Look into fancier variation from https://ja.nsommer.dk/articles/type-checked-url-router.html
/** Extract params from an express path (e.g. '/students/:studentId'). */
export type ExtractRouteParams<T extends string> =
  string extends T
  ? Record<string, string>
  : T extends `${infer _Start}:${infer Param}/${infer Rest}`
  ? {[k in Param | keyof ExtractRouteParams<Rest>]: string}
  : T extends `${infer _Start}:${infer Param}`
  ? {[k in Param]: string}
  : {};

export type HTTPVerb = 'get' | 'post' | 'put' | 'delete' | 'patch';

export type Unionize<T> = {[k in keyof T]: {k: k, v: T[k]}}[keyof T];
