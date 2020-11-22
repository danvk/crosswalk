import {assert as assertType, _} from 'spec.ts';
import {DeepReadonly} from '../utils';

describe('utils', () => {
  it('should make deep readonly types', () => {
    type ReadonlyArray = DeepReadonly<string[]>;
    assertType(_ as ReadonlyArray, _ as readonly string[]);

    type ReadonlyObj = DeepReadonly<{foo: string}>;
    assertType(_ as ReadonlyObj, _ as {readonly foo: string});

    const u = {
      foo: {
        bar: ['baz', 'quux'],
      },
    };
    assertType(u, _ as {foo: {bar: string[]}});
    assertType(
      _ as DeepReadonly<typeof u>,
      _ as {readonly foo: {readonly bar: readonly string[]}},
    );
  });
});
