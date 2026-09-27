import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  Container,
  DependencyInjectionError,
  ErrorCode,
  InjectScope,
  type IOnFinalized,
  type IOnInitialized,
  type TTargetOptions,
} from '#base/index';


describe('Testing "add()" method', () => {
  let container: Container<any>;

  beforeEach(() => {
    container = new Container();
  });

  it('Should add a provider to the container', () => {
    const options: TTargetOptions = {
      valueFactory: () => 'test',
      inject: [],
      scope: InjectScope.SINGLETON,
    };

    expect(() => container.add('test', options)).not.toThrow();
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

  it('Should allow an empty string selector', async () => {
    container.add('', { valueFactory: () => 'empty selector' });

    await expect(container.get('')).resolves.toBe('empty selector');
  });

  it('Should throw an error when the target is already registered', async () => {
    container.add('test');

    try {
      container.add('test');
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

describe('Testing "get()" method', () => {
  let container: Container<any>;

  beforeEach(() => {
    container = new Container();
  });

  it('Should return null when the selector has not been registered', async () => {
    await expect(container.get('NonexistentTarget')).resolves.toBeNull();
  });

  it('Should return the instance associated with the selector if it exists', async () => {
    const target = 'TestSelector';

    await container
      .add(target, {
        valueFactory: () => 'TestValue',
      })
      .finalize();

    await expect(container.get(target)).resolves.toEqual('TestValue');
  });

  it('Should handle the singleton scope appropriately', async () => {
    const spyFn = vi.fn();

    class C {
      constructor () {
        spyFn();
      }
    }

    await container.add(C).finalize();

    await container.get(C);
    await container.get(C);
    await container.get(C);

    expect(spyFn).toHaveBeenCalledOnce();
  });

  it.each([false, 0, '', null, undefined, NaN])(
    'Should cache the singleton factory result %s',
    async (value) => {
      const factory = vi.fn(() => value);

      container.add('FalsySingleton', { valueFactory: factory });

      await expect(container.get('FalsySingleton')).resolves.toBe(value);
      await expect(container.get('FalsySingleton')).resolves.toBe(value);
      expect(factory).toHaveBeenCalledOnce();
    },
  );

  it('Should create a singleton only once for concurrent requests', async () => {
    const factory = vi.fn(async () => {
      await Promise.resolve();
      return {};
    });

    container.add('ConcurrentSingleton', { valueFactory: factory });

    const [first, second] = await Promise.all([
      container.get('ConcurrentSingleton'),
      container.get('ConcurrentSingleton'),
    ]);

    expect(factory).toHaveBeenCalledOnce();
    expect(first).toBe(second);
  });

  it('Should retry a singleton after concurrent factory failures', async () => {
    const error = new Error('factory failed');
    const value = {};
    const factory = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(value);

    container.add('RetrySingleton', { valueFactory: factory });

    const failures = await Promise.allSettled([
      container.get('RetrySingleton'),
      container.get('RetrySingleton'),
    ]);

    expect(failures).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    await expect(container.get('RetrySingleton')).resolves.toBe(value);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('Should handle the request scope appropriately', async () => {
    const target: any = {};

    await container
      .add(target, {
        scope: InjectScope.REQUEST,
        valueFactory: () => 'RequestValue',
      })
      .finalize();

    const context = { request: 'TestContext' };

    await expect(container.get(target)).rejects.toThrow(
      DependencyInjectionError,
    );
    await expect(container.get(target, context)).resolves.not.toThrow();

    await expect(container.get(target, context)).resolves.toEqual(
      'RequestValue',
    );
  });

  it('Should create one request instance per context for concurrent requests', async () => {
    const factory = vi.fn(async () => {
      await Promise.resolve();
      return {};
    });
    const firstContext = {};
    const secondContext = {};

    container.add('ConcurrentRequest', {
      scope: InjectScope.REQUEST,
      valueFactory: factory,
    });

    const [first, firstAgain, second] = await Promise.all([
      container.get('ConcurrentRequest', firstContext),
      container.get('ConcurrentRequest', firstContext),
      container.get('ConcurrentRequest', secondContext),
    ]);

    expect(factory).toHaveBeenCalledTimes(2);
    expect(first).toBe(firstAgain);
    expect(first).not.toBe(second);
  });

  it('Should retry a request provider after concurrent factory failures', async () => {
    const error = new Error('factory failed');
    const value = {};
    const factory = vi.fn()
      .mockRejectedValueOnce(error)
      .mockResolvedValue(value);
    const context = {};

    container.add('RetryRequest', {
      scope: InjectScope.REQUEST,
      valueFactory: factory,
    });

    const failures = await Promise.allSettled([
      container.get('RetryRequest', context),
      container.get('RetryRequest', context),
    ]);

    expect(failures).toEqual([
      { status: 'rejected', reason: error },
      { status: 'rejected', reason: error },
    ]);
    await expect(container.get('RetryRequest', context)).resolves.toBe(value);
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it('Should throw an error for an unknown scope', async () => {
    const UNKNOWN_SCOPE = 'UnknownScope';

    await container
      .add(UNKNOWN_SCOPE, {
        scope: 'Unknown' as InjectScope,
      })
      .finalize();

    await expect(container.get(UNKNOWN_SCOPE)).rejects.toThrow(
      DependencyInjectionError,
    );
  });

  it('Should return instance when target is a class constructor', async () => {
    class TestClass {}

    await container.add(TestClass).finalize();

    await expect(container.get(TestClass)).resolves.toBeInstanceOf(TestClass);
  });

  it('Should return value when target is a Symbol', async () => {
    const sym = Symbol('test');

    await container
      .add(sym, {
        valueFactory: () => 'TestValue',
      })
      .finalize();

    await expect(container.get(sym)).resolves.toEqual('TestValue');
  });

  it('Should return resolved result when target have a factory', async () => {
    await container
      .add('K', {
        valueFactory: () => ({ some: 'value' }),
      })
      .finalize();

    await expect(container.get('K')).resolves.toEqual({ some: 'value' });
  });

  it('Should return resolved result when target have a factory with constructor', async () => {
    class TestClass {}

    await container
      .add('aab', {
        valueFactory: () => TestClass,
      })
      .finalize();

    await expect(container.get('aab')).resolves.toBeInstanceOf(TestClass);
  });

  it('Should return a regular function produced by a factory as a value', async () => {
    function callback () { return 42; }

    container.add('callback', { valueFactory: () => callback });

    await expect(container.get('callback')).resolves.toBe(callback);
  });

  it('Should throw if valueFactory has not properly set', async () => {
    await container
      .add('A', {
        valueFactory: {} as any,
      })
      .finalize();

    try {
      await container.get('A');
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

  it('Should throw if target has null value and either is not a constructor', async () => {
    await container.add('Aaa', {}).finalize();

    try {
      await container.get('Aaa');
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
    it('Should reject a direct circular dependency', async () => {
      container.add('A', {
        inject: ['A'],
        valueFactory: () => ({}),
      });

      await expect(container.get('A')).rejects.toMatchObject({
        code: ErrorCode.CIRCULAR_DEPENDENCY,
      });
    });

    it('Should reject an indirect circular dependency', async () => {
      container
        .add('A', { inject: ['B'], valueFactory: () => ({}) })
        .add('B', { inject: ['A'], valueFactory: () => ({}) });

      const results = await Promise.allSettled([
        container.get('A'),
        container.get('B'),
      ]);

      expect(results).toEqual([
        { status: 'rejected', reason: expect.objectContaining({
          code: ErrorCode.CIRCULAR_DEPENDENCY,
        }) },
        { status: 'rejected', reason: expect.objectContaining({
          code: ErrorCode.CIRCULAR_DEPENDENCY,
        }) },
      ]);
    });

    it('Should properly inject dependency in the singletone class constructor', async () => {
      class TestClass {
        #value: number;

        constructor (dependency: number) {
          this.#value = dependency;
        }

        get value (): number {
          return this.#value;
        }
      }

      await container
        .add('SomeTarget', {
          valueFactory: () => 123,
        })
        .add(TestClass, {
          inject: ['SomeTarget'],
        })
        .finalize();

      const resolved = await container.getOrFail(TestClass);
      expect(resolved).toBeInstanceOf(TestClass);
      expect(resolved.value).toEqual(123);
    });

    it('Should properly inject as arguments when target is a function', async () => {
      await container
        .add('A', { valueFactory: () => 'test1' })
        .add('B', { valueFactory: () => 'test2' })
        .add('K', {
          valueFactory: ([a, b]) => ({ a, b }),
          inject: ['A', 'B'],
        })
        .finalize();

      await expect(container.get('K')).resolves.toEqual({
        a: 'test1',
        b: 'test2',
      });
    });

    it('Should keep repeated selectors in inject order', async () => {
      container
        .add('A', { valueFactory: () => 'first' })
        .add('B', { valueFactory: () => 'second' })
        .add('Target', {
          inject: ['A', 'B', 'A'],
          valueFactory: (dependencies) => dependencies,
        });

      await expect(container.get('Target')).resolves.toEqual([
        'first', 'second', 'first',
      ]);
    });

    it('Should keep equal values from different selectors', async () => {
      const shared = {};

      container
        .add('A', { valueFactory: () => shared })
        .add('B', { valueFactory: () => shared })
        .add('Target', {
          inject: ['A', 'B'],
          valueFactory: (dependencies) => dependencies,
        });

      await expect(container.get('Target')).resolves.toEqual([shared, shared]);
    });

    it('Should properly inject dependency and context in the request-scoped class constructor', async () => {
      class TestClass {
        #value: number;
        #context: Record<any, any>;

        constructor (dependency: number, context: Record<any, any>) {
          this.#value = dependency;
          this.#context = context;
        }

        get value () {
          return this.#value;
        }

        get context () {
          return this.#context;
        }
      }

      await container
        .add('SomeTarget', {
          valueFactory: () => 124,
        })
        .add(TestClass, {
          inject: ['SomeTarget'],
          scope: InjectScope.REQUEST,
        })
        .finalize();

      const context = {};
      const resolved = await container.getOrFail(TestClass, context);

      expect(resolved).toBeInstanceOf(TestClass);
      expect(resolved.value).toEqual(124);
      expect(resolved.context).toEqual(context);
    });

    it('Should throw if trying to inject request-scoped target inside singletone', async () => {
      class TestClass {
        constructor (_dependency: unknown) {}
      }

      await container
        .add('SomeTarget', {
          valueFactory: () => 123,
          scope: InjectScope.REQUEST,
        })
        .add(TestClass, {
          inject: ['SomeTarget'],
        })
        .finalize();

      try {
        await container.get(TestClass);
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

    it('Should throw if trying to inject unregistered target', async () => {
      class Eee {}

      class TestClass {
        constructor (_e: Eee) {}
      }

      await container
        .add(TestClass, {
          inject: [Eee],
        })
        .finalize();

      try {
        await container.get(TestClass);
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
    it('should finalize without creating a request-scoped class', async () => {
      const constructorSpy = vi.fn();

      class RequestService implements IOnFinalized {
        constructor () { constructorSpy(); }
        onFinalized () {}
      }

      container.add(RequestService, { scope: InjectScope.REQUEST });

      await expect(container.finalize()).resolves.toBe(container);
      expect(constructorSpy).not.toHaveBeenCalled();
      await expect(container.get(RequestService, {})).resolves.toBeInstanceOf(RequestService);
      expect(constructorSpy).toHaveBeenCalledOnce();
    });

    it('should wait for an asynchronous onInitialized() hook', async () => {
      let finishHook!: () => void;
      let hookStarted!: () => void;
      const hookGate = new Promise<void>((resolve) => { finishHook = resolve; });
      const started = new Promise<void>((resolve) => { hookStarted = resolve; });

      class AsyncService implements IOnInitialized {
        ready = false;

        async onInitialized () {
          hookStarted();
          await hookGate;
          this.ready = true;
        }
      }

      container.add(AsyncService);
      const resolution = container.getOrFail(AsyncService);
      await started;

      let settled = false;
      void resolution.then(() => { settled = true; });
      await new Promise((resolve) => { setTimeout(resolve, 0); });
      expect(settled).toBe(false);

      finishHook();
      const instance = await resolution;
      expect(instance.ready).toBe(true);
    });

    it('should reject and retry when onInitialized() fails', async () => {
      const error = new Error('initialization failed');
      let attempts = 0;

      class RetryService implements IOnInitialized {
        async onInitialized () {
          if (++attempts === 1) {
            throw error;
          }
        }
      }

      container.add(RetryService);

      await expect(container.get(RetryService)).rejects.toBe(error);
      await expect(container.get(RetryService)).resolves.toBeInstanceOf(RetryService);
      expect(attempts).toBe(2);
    });

    it('should call onFinalized() methods when finalize() called', async () => {
      class Test1 implements IOnFinalized {
        onFinalized () {}
      }

      class Test2 implements IOnFinalized {
        async onFinalized () {
          return 123 as any;
        }
      }

      const spy1 = vi.spyOn(Test1.prototype, 'onFinalized');
      const spy2 = vi.spyOn(Test2.prototype, 'onFinalized');

      await container.add(Test1).add(Test2).finalize();

      expect(spy1).toHaveBeenCalledOnce();
      expect(spy2).toHaveBeenCalledOnce();

      await expect(spy2.mock.results[0].value).resolves.toEqual(123);
    });

    it('should call onInitialized() method when target initialized', async () => {
      class Test1 implements IOnInitialized {
        onInitialized () {}
      }

      class Test2 implements IOnInitialized {
        async onInitialized () {}
      }

      vi.spyOn(Test1.prototype, 'onInitialized');
      vi.spyOn(Test2.prototype, 'onInitialized');

      await container
        .add(Test1)
        .add(Test2, {
          inject: [Test1],
        })
        .finalize();

      const test1 = await container.getOrFail(Test1);
      expect(test1.onInitialized).toHaveBeenCalledOnce();

      const test2 = await container.getOrFail(Test2);
      expect(test2.onInitialized).toHaveBeenCalledOnce();
    });

    it('alias `build()` should work', async () => {
      class Test1 {}

      const spyFinalize = vi.spyOn(container, 'finalize');

      await container.add(Test1).build();

      expect(spyFinalize).toHaveBeenCalledOnce();
    });

    it('regular object onFinalized method should called', async () => {
      const Test1: IOnFinalized = {
        onFinalized () {},
      };

      const Test2: IOnFinalized = {
        async onFinalized () {
          return 123 as any;
        },
      };

      const spy1 = vi.spyOn(Test1, 'onFinalized');
      const spy2 = vi.spyOn(Test2, 'onFinalized');

      await container
        .add(Test1, {
          valueFactory: () => Test1,
        })
        .add(Test2, {
          valueFactory: () => Test2,
        })
        .finalize();

      expect(spy1).toHaveBeenCalledOnce();
      expect(spy2).toHaveBeenCalledOnce();

      await expect(spy2.mock.results[0].value).resolves.toEqual(123);
    });
  });

  describe('getOrFail()', () => {
    it("Should call regular get() method if it's fine", async () => {
      container.add('SomeTarget', { valueFactory: () => 123 });

      await expect(container.getOrFail('SomeTarget')).resolves.toEqual(123);
    });

    it('Should throw if target is not found', async () => {
      try {
        await container.getOrFail('NonexistentTarget');
      } catch (e: any) {
        expect(e).instanceOf(DependencyInjectionError);
        expect(e.hasCode(ErrorCode.UNKNOWN_TARGET)).toBeTruthy();

        return;
      }

      throw new Error('Test failed');
    });
  });
});
