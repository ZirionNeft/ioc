import {
  Container,
  DependencyInjectionError,
  ErrorCode,
  InjectScope, type IOnFinalized,
  type ITargetOptions,
} from '#base/index';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('Testing "add()" method', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('Should add a provider to the container', () => {
    const options: ITargetOptions<string> = {
      value: 'test',
      inject: [],
      scope: InjectScope.SINGLETON,
    };

    expect(() => container.add<string>('test', options)).not.toThrow();
  });

  it('Should throw an error when the target is null', () => {
    try {
      container.add(null as any);
    } catch (e: any) {
      expect(e).instanceOf(DependencyInjectionError);
      expect(
        e.hasCode(ErrorCode.TARGET_NULL),
        `Wrong error code: ${e.code}`,
      ).toBeTruthy();
      return;
    }

    throw new Error('Test failed');
  });
  it('Should throw an error when the target is undefined', () => {
    try {
      container.add(undefined as any);
    } catch (e: any) {
      expect(e).instanceOf(DependencyInjectionError);
      expect(
        e.hasCode(ErrorCode.TARGET_NULL),
        `Wrong error code: ${e.code}`,
      ).toBeTruthy();
      return;
    }

    throw new Error('Test failed');
  });

  it('Should throw an error when the target is already registered', () => {
    container.add<string>('test');

    try {
      container.add<string>('test');
    } catch (e: any) {
      expect(e).instanceOf(DependencyInjectionError);
      expect(
        e.hasCode(ErrorCode.TARGET_DUPLICATE),
        `Wrong error code: ${e.code}`,
      ).toBeTruthy();
      return;
    }

    throw new Error('Test failed');
  });
});

describe('get()', () => {
  let container: Container;

  beforeEach(() => {
    container = new Container();
  });

  it('Should return null when the selector has not been registered', () => {
    expect(container.get('NonexistentTarget')).toBeNull();
  });

  it('Should return the instance associated with the selector if it exists', () => {
    const target = 'TestSelector';

    container.add(target, {
      value: 'TestValue',
    });

    expect(container.get(target)).toEqual('TestValue');
  });

  it('Should handle the singleton scope appropriately', () => {
    const A = vi.fn(() => ({}));

    container.add(A);

    container.get(A);
    container.get(A);
    container.get(A);

    expect(A).has.been.toBeCalledTimes(1);
  });

  it('Should handle the request scope appropriately', () => {
    const target: any = {};
    container.add(target, {
      scope: InjectScope.REQUEST,
      value: 'RequestValue',
    });

    const context = { request: 'TestContext' };
    expect(() => container.get(target)).toThrow(DependencyInjectionError);
    expect(() => container.get(target, context)).not.toThrow();

    expect(container.get(target, context)).toEqual('RequestValue');
  });

  it('Should throw an error for an unknown scope', () => {
    const UNKNOWN_SCOPE = 'UnknownScope';
    container.add(UNKNOWN_SCOPE, {
      scope: 'Unknown' as InjectScope,
    });

    expect(() => container.get(UNKNOWN_SCOPE)).toThrow(
      DependencyInjectionError,
    );
  });

  it('Should return instance when target is a class constructor', () => {
    class TestClass {}

    container.add(TestClass);

    expect(container.get(TestClass)).toBeInstanceOf(TestClass);
  });

  it('Should return value when target is a Symbol', () => {
    const sym = Symbol('test');

    container.add(sym, {
      value: 'TestValue',
    });

    expect(container.get(sym)).toEqual('TestValue');
  });

  it('Should return resolved result when target is a function', () => {
    container.add('K', { value: () => ({ some: 'value' }) });

    expect(container.get('K')).toEqual({ some: 'value' });
  });

  it('Should throw if target has null value and either is not a constructor', () => {
    container.add('Aaa', {});

    try {
      expect(container.get('Aaa'));
    } catch (e: any) {
      expect(e).instanceOf(DependencyInjectionError);
      expect(
        e.hasCode(ErrorCode.TARGET_TYPE_BAD_RESOLVER),
        `Wrong error code: ${e.code}`,
      ).toBeTruthy();
      return;
    }

    throw new Error('Test failed');
  });

  describe('Dependencies injecting', () => {
    it('Should properly inject dependency in the singletone class constructor', () => {
      class TestClass {
        #value: number;
        constructor(dependency: number) {
          this.#value = dependency;
        }

        get value(): number {
          return this.#value;
        }
      }

      container.add('SomeTarget', { value: 123 }).add(TestClass, {
        inject: ['SomeTarget'],
      });

      const resolved = container.getOrFail(TestClass);
      expect(resolved).toBeInstanceOf(TestClass);
      expect(resolved.value).toEqual(123);
    });

    it('Should properly inject as arguments when target is a function', () => {
      container
        .add('A', { value: 'test1' })
        .add('B', { value: 'test2' })
        .add('K', { value: (a, b) => ({ a, b }), inject: ['A', 'B'] });

      expect(container.get('K')).toEqual({ a: 'test1', b: 'test2' });
    });

    it('Should properly inject dependency and context in the request-scoped class constructor', () => {
      class TestClass {
        #value: number;
        #context: Record<any, any>;
        constructor(dependency: number, context: Record<any, any>) {
          this.#value = dependency;
          this.#context = context;
        }

        get value() {
          return this.#value;
        }
        get context() {
          return this.#context;
        }
      }

      container.add('SomeTarget', { value: 124 }).add(TestClass, {
        inject: ['SomeTarget'],
        scope: InjectScope.REQUEST,
      });

      const context = {};
      const resolved = container.getOrFail(TestClass, context);

      expect(resolved).toBeInstanceOf(TestClass);
      expect(resolved.value).toEqual(124);
      expect(resolved.context).toEqual(context);
    });

    it('Should throw if trying to inject request-scoped target inside singletone', () => {
      class TestClass {
        constructor(_dependency: unknown) {}
      }

      container
        .add('SomeTarget', { value: 123, scope: InjectScope.REQUEST })
        .add(TestClass, {
          inject: ['SomeTarget'],
        });

      try {
        container.get(TestClass);
      } catch (e: any) {
        expect(e).instanceOf(DependencyInjectionError);
        expect(
          e.hasCode(ErrorCode.SINGLETONE_SCOPE_WRONG_CONTEXT),
          `Wrong error code: ${e.code}`,
        ).toBeTruthy();
        return;
      }

      throw new Error('Test failed');
    });

    it('Should throw if trying to inject unregistered target', () => {
      class Eee {}
      class TestClass {
        constructor(e: Eee) {}
      }

      container.add(TestClass, {
        inject: [Eee],
      });

      try {
        container.get(TestClass);
      } catch (e: any) {
        expect(e).instanceOf(DependencyInjectionError);
        expect(
          e.hasCode(ErrorCode.UNKNOWN_TARGET),
          `Wrong error code: ${e.code}`,
        ).toBeTruthy();
        return;
      }

      throw new Error('Test failed');
    });
  });

  describe('lifecycle hooks', () => {
    it('should call onFinalized() methods when finalyze() called', async () => {
      class Test1 implements IOnFinalized {
        onFinalized() {}
      }
      class Test2 implements IOnFinalized {
        onFinalized() {
          return Promise.resolve(123 as any)
        }
      }

      vi.spyOn(Test1.prototype, 'onFinalized');
      const spy2 = vi.spyOn(Test2.prototype, 'onFinalized');

      await container.add(Test1).add(Test2).finalize();

      const test1 = container.getOrFail(Test1);
      expect(test1.onFinalized).toHaveBeenCalledOnce();

      const test2 = container.getOrFail(Test2);
      expect(test2.onFinalized).toHaveBeenCalledOnce();
      await expect(spy2.mock.results[0].value).resolves.toEqual(123);
    })
  })

  describe('getOrFail()', () => {
    it("Should call regular get() method if it's fine", () => {
      container.add('SomeTarget', { value: 123 });
      expect(container.getOrFail('SomeTarget')).toEqual(123);
    });

    it('Should throw if target is not found', () => {
      try {
        container.getOrFail('NonexistentTarget');
      } catch (e: any) {
        expect(e).instanceOf(DependencyInjectionError);
        expect(e.hasCode(ErrorCode.UNKNOWN_TARGET)).toBeTruthy();
        return;
      }

      throw new Error('Test failed');
    });
  });
});
