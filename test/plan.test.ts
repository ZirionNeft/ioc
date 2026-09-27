import { describe, expect, it, vi } from 'vitest';

import { Container, ErrorCode, InjectScope } from '#base/index';


describe('resolution plans', () => {
  it('does not create part of a graph with a missing nested dependency and rebuilds after registration', async () => {
    const leaf = vi.fn(() => 'ready');
    const container = new Container()
      .add('leaf', { valueFactory: leaf })
      .add('middle', { inject: ['leaf', 'missing'], valueFactory: values => values })
      .add('root', { inject: ['middle'], valueFactory: values => values });

    await expect(container.get('root')).rejects.toMatchObject({ code: ErrorCode.UNKNOWN_TARGET });
    expect(leaf).not.toHaveBeenCalled();

    container.add('missing', { valueFactory: () => 'added' });

    await expect(container.get('root')).resolves.toEqual([['ready', 'added']]);
  });

  it('preserves repeated transient dependencies in a cached plan', () => {
    class Leaf {}
    class Root {
      constructor (readonly first: Leaf, readonly second: Leaf) {}
    }
    const container = new Container().add(Leaf).add(Root, { inject: [Leaf, Leaf] });

    for (let index = 0; index < 3; index++) {
      const root = container.getOrFailSync(Root);
      expect(root.first).not.toBe(root.second);
    }
  });

  it('checks singleton-to-request scope even if the dependency plan was cached', () => {
    class RequestService {}
    class Consumer {
      constructor (readonly request: RequestService) {}
    }
    const container = new Container()
      .add(RequestService, { scope: InjectScope.REQUEST })
      .add(Consumer, { inject: [RequestService], scope: InjectScope.SINGLETON });

    container.getOrFailSync(RequestService, {});
    expect(() => container.getOrFailSync(Consumer)).toThrowError(
      expect.objectContaining({ code: ErrorCode.SINGLETONE_SCOPE_WRONG_CONTEXT }),
    );
  });
});
