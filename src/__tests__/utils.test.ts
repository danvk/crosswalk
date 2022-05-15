import {assert as assertType, _} from 'spec.ts';
import {DeepReadonly} from '../utils';

describe('utils', () => {
  it('should make deep readonly types', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type ReadonlyArray = DeepReadonly<string[]>;
    //   ^? type ReadonlyArray = readonly string[]

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type ReadonlyObj = DeepReadonly<{foo: string}>;
    //   ^? type ReadonlyObj = { readonly foo: string; }

    const user = {
      foo: {
        bar: ['baz', 'quux'],
      },
    };
    user
    // ^? const user: { foo: { bar: string[]; }; }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    type T = DeepReadonly<typeof user>;
    //   ^? type T = {readonly foo: {readonly bar: readonly string[]; }; }
  });
});
