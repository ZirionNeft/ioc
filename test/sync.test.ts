import { describe, expect, it, vi } from 'vitest';

import { Container, ErrorCode, InjectScope } from '#base/index';


describe('synchronous resolution', () => {
  it('creates a new value by default on each synchronous resolution', () => {
    const container = new Container().add('value', { valueFactory: () => ({}) });

    expect(container.getOrFailSync('value')).not.toBe(container.getOrFailSync('value'));
  });

  it('returns synchronous singleton and transient values without a Promise', async () => {
    const factory = vi.fn(() => 0);
    class Service {}

    const container = new Container()
      .add('zero', { valueFactory: factory, scope: InjectScope.SINGLETON })
      .add(Service, { scope: InjectScope.TRANSIENT });

    expect(container.getOrFailSync('zero')).toBe(0);
    expect(container.getOrFailSync('zero')).toBe(0);
    expect(factory).toHaveBeenCalledOnce();
    expect(container.getOrFailSync(Service)).not.toBe(container.getOrFailSync(Service));
    expect(await container.getOrFail('zero')).toBe(0);
  });

  it('keeps injection order, duplicates, and request-context cache', () => {
    class Dependency {}
    class Consumer {
      constructor (readonly first: Dependency, readonly second: Dependency) {}
    }

    const container = new Container()
      .add(Dependency, { scope: InjectScope.REQUEST })
      .add(Consumer, { scope: InjectScope.TRANSIENT, inject: [Dependency, Dependency] });
    const context = {};
    const first = container.getOrFailSync(Consumer, context);
    const second = container.getOrFailSync(Consumer, context);

    expect(first.first).toBe(first.second);
    expect(first.first).toBe(second.first);
    expect(container.getOrFailSync(Dependency, {})).not.toBe(first.first);
  });

  it('reports missing targets and cycles synchronously', () => {
    const container = new Container().add('cycle', {
      inject: ['cycle'], valueFactory: () => 1,
    });

    expect(container.getSync('absent' as 'cycle')).toBeNull();
    expect(() => container.getOrFailSync('absent' as 'cycle')).toThrowError(
      expect.objectContaining({ code: ErrorCode.UNKNOWN_TARGET }),
    );
    expect(() => container.getSync('cycle')).toThrowError(
      expect.objectContaining({ code: ErrorCode.CIRCULAR_DEPENDENCY }),
    );
  });

  it('requires async resolution for an async factory and shares its pending result', async () => {
    let release!: (value: number) => void;
    const gate = new Promise<number>((resolve) => { release = resolve; });
    const factory = vi.fn(() => gate);
    const container = new Container().add('value', {
      valueFactory: factory,
      scope: InjectScope.SINGLETON,
    });

    expect(() => container.getOrFailSync('value')).toThrowError(
      expect.objectContaining({ code: ErrorCode.ASYNC_RESOLUTION_REQUIRED }),
    );
    const pending = container.getOrFail('value');
    expect(factory).toHaveBeenCalledOnce();
    release(42);
    await expect(pending).resolves.toBe(42);
    expect(container.getOrFailSync('value')).toBe(42);
  });

  it('requires async resolution for a transitive async dependency or hook', async () => {
    class Service {
      async onInitialized () { return undefined; }
    }
    const container = new Container()
      .add('dependency', {
        valueFactory: async () => 'ready',
        scope: InjectScope.SINGLETON,
      })
      .add('consumer', {
        inject: ['dependency'],
        valueFactory: ([value]) => value,
      })
      .add(Service, { scope: InjectScope.SINGLETON });

    expect(() => container.getSync('consumer')).toThrowError(
      expect.objectContaining({ code: ErrorCode.ASYNC_RESOLUTION_REQUIRED }),
    );
    expect(() => container.getSync(Service)).toThrowError(
      expect.objectContaining({ code: ErrorCode.ASYNC_RESOLUTION_REQUIRED }),
    );
    await expect(container.getOrFail('consumer')).resolves.toBe('ready');
    expect(container.getOrFailSync('consumer')).toBe('ready');
    expect(container.getOrFailSync(Service)).toBeInstanceOf(Service);
  });

  it('retries after an asynchronous factory rejects', async () => {
    const failure = new Error('failed');
    let attempts = 0;
    const container = new Container().add('retry', {
      valueFactory: () => ++attempts === 1 ? Promise.reject(failure) : 7,
    });

    expect(() => container.getSync('retry')).toThrowError(
      expect.objectContaining({ code: ErrorCode.ASYNC_RESOLUTION_REQUIRED }),
    );
    await Promise.resolve();
    await Promise.resolve();
    expect(container.getOrFailSync('retry')).toBe(7);
    expect(attempts).toBe(2);
  });
});
