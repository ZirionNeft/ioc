import { describe, expect, it, vi } from 'vitest';

import { Container, ErrorCode, InjectScope } from '#base/index';


describe('resolution graph shapes', () => {
  it.each([0, 1, 2, 4])('preserves %i ordered dependencies and forwards context', (count) => {
    // A rest constructor would collect the context into the array, so retain
    // the actual argument list for checking each graph size.
    class Target {
      readonly args: unknown[];

      constructor (...args: unknown[]) {
        this.args = args;
      }
    }

    const selectors = Array.from({ length: count }, (_, index) => `dep-${index}`);
    let container: Container<any, any> = new Container();
    for (let index = 0; index < count; index++) {
      const id = index;
      container = container.add(selectors[index], { valueFactory: () => ({ id }) });
    }
    container = container.add(Target, { inject: selectors });
    const context = { requestId: 'context' };

    const first = container.getOrFailSync(Target, context) as Target;
    const second = container.getOrFailSync(Target, context) as Target;
    expect(first).toBeInstanceOf(Target);
    expect(first.args.slice(0, count)).toEqual(selectors.map((_, index) => ({ id: index })));
    expect(first.args[count]).toBe(context);
    expect(second).not.toBe(first);
    for (let index = 0; index < count; index++) {
      expect(second.args[index]).not.toBe(first.args[index]);
    }
  });

  it('awaits a custom thenable in a one-dependency class and runs its async hook', async () => {
    const initialized = vi.fn();
    class Root {
      constructor (readonly value: string) {}

      async onInitialized () {
        await Promise.resolve();
        initialized(this.value);
      }
    }
    const thenable = {
      then (resolve: (value: string) => void) {
        queueMicrotask(() => resolve('ready'));
      },
    } as PromiseLike<string>;
    const container = new Container()
      .add('dep', { scope: InjectScope.SINGLETON, valueFactory: () => thenable })
      .add(Root, { inject: ['dep'] });

    expect(() => container.getOrFailSync(Root)).toThrowError(
      expect.objectContaining({ code: ErrorCode.ASYNC_RESOLUTION_REQUIRED }),
    );
    const root = await container.getOrFail(Root);
    expect(root.value).toBe('ready');
    expect(initialized).toHaveBeenCalledWith('ready');
  });

  it('starts independent async dependencies together and keeps their order', async () => {
    let releaseA!: (value: string) => void;
    let releaseB!: (value: string) => void;
    const a = new Promise<string>((resolve) => { releaseA = resolve; });
    const b = new Promise<string>((resolve) => { releaseB = resolve; });
    const started = vi.fn();
    class Root {
      constructor (readonly first: string, readonly second: string) {}
    }
    const container = new Container()
      .add('a', { valueFactory: () => {
        started('a');

        return a;
      } })
      .add('b', { valueFactory: () => {
        started('b');

        return b;
      } })
      .add(Root, { inject: ['a', 'b'] });

    const pending = container.getOrFail(Root);
    expect(started.mock.calls).toEqual([['a'], ['b']]);
    releaseB('second');
    releaseA('first');
    await expect(pending).resolves.toMatchObject({ first: 'first', second: 'second' });
  });

  it('propagates a rejected async dependency and retries the next resolution', async () => {
    const failure = new Error('dependency failed');
    let attempts = 0;
    const construct = vi.fn();
    class Root {
      constructor (readonly value: string) { construct(); }
    }
    const container = new Container()
      .add('dep', {
        scope: InjectScope.SINGLETON,
        valueFactory: () => ++attempts === 1 ? Promise.reject(failure) : Promise.resolve('ready'),
      })
      .add(Root, { inject: ['dep'] });

    await expect(container.getOrFail(Root)).rejects.toBe(failure);
    expect(construct).not.toHaveBeenCalled();
    await expect(container.getOrFail(Root)).resolves.toMatchObject({ value: 'ready' });
    expect(construct).toHaveBeenCalledOnce();
    expect(attempts).toBe(2);
  });

  it('shares request values for a repeated dependency while keeping roots transient', () => {
    class Dependency {}
    class Root {
      constructor (readonly first: Dependency, readonly second: Dependency, readonly context: object) {}
    }
    const container = new Container()
      .add(Dependency, { scope: InjectScope.REQUEST })
      .add(Root, { inject: [Dependency, Dependency] });
    const context = {};
    const first = container.getOrFailSync(Root, context);
    const second = container.getOrFailSync(Root, context);

    expect(first).not.toBe(second);
    expect(first.first).toBe(first.second);
    expect(first.first).toBe(second.first);
    expect(first.context).toBe(context);
    expect(container.getOrFailSync(Root, {}).first).not.toBe(first.first);
    expect(() => container.getOrFailSync(Root)).toThrowError(
      expect.objectContaining({ code: ErrorCode.REQUEST_SCOPE_CONTEXT_REQUIRED }),
    );
  });

  it('reports missing dependencies and cycles before constructing a one-dependency root', () => {
    const construct = vi.fn();
    class Root {
      constructor (readonly dependency: unknown) { construct(); }
    }
    const missing = new Container().add(Root, { inject: ['missing'] });
    expect(() => missing.getOrFailSync(Root)).toThrowError(
      expect.objectContaining({ code: ErrorCode.UNKNOWN_TARGET }),
    );
    const cycle = new Container().add(Root, { inject: [Root] });
    expect(() => cycle.getOrFailSync(Root)).toThrowError(
      expect.objectContaining({ code: ErrorCode.CIRCULAR_DEPENDENCY }),
    );
    expect(construct).not.toHaveBeenCalled();
  });

  it('propagates constructor and async-hook failures', async () => {
    const constructorError = new Error('constructor failed');
    const hookError = new Error('hook failed');
    class ThrowingRoot {
      constructor (readonly dependency: string) { throw constructorError; }
    }
    class HookRoot {
      constructor (readonly dependency: string) {}

      async onInitialized () { throw hookError; }
    }
    const container = new Container()
      .add('dep', { valueFactory: () => 'ready' })
      .add(ThrowingRoot, { inject: ['dep'] })
      .add(HookRoot, { inject: ['dep'] });

    expect(() => container.getOrFailSync(ThrowingRoot)).toThrow(constructorError);
    await expect(container.getOrFail(ThrowingRoot)).rejects.toBe(constructorError);
    await expect(container.getOrFail(HookRoot)).rejects.toBe(hookError);
  });
});
