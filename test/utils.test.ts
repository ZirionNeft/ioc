import { describe, expect, it } from 'vitest';

import { isClassConstructor, targetName } from '#base/utils';

describe('isClassConstructor', () => {
  it('isClassConstructor returns true for class constructors', () => {
    class SomeClass {}

    expect(isClassConstructor(SomeClass)).toBe(true);
  });

  it('isClassConstructor returns false for non-class objects', () => {
    const notAClass = () => {};

    expect(isClassConstructor(notAClass)).toBe(false);
  });
});

describe('targetName', () => {
  it('returns a string for given target', () => {
    expect(targetName('Foo')).toBe('Foo');
  });

  it('returns class constructor name', () => {
    class SomeClass {}

    expect(targetName(SomeClass)).toBe('SomeClass');
  });

  it('returns the string form of non-null non-string targets', () => {
    const target = { toString: () => 'exampleTarget' };

    expect(targetName(target)).toBe('exampleTarget');
  });

  it('returns the string form of lambda function targets', () => {
    const target = () => {};

    expect(targetName(target)).toBe('target');
  });
});
