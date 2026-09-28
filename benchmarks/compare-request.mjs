import 'reflect-metadata';
import { resolve as resolvePath } from 'node:path';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';

import { createContainer, asClass, InjectionMode } from 'awilix';
import {
  Container as InversifyContainer,
  injectable as inversifyInjectable,
  inject as inversifyInject,
} from 'inversify';
import tsyringe from 'tsyringe';


const {
  Lifecycle,
  injectable: tsyringeInjectable,
  inject: tsyringeInject,
  container: tsyringeRoot,
} = tsyringe;

const baseBuild = await import(process.env.BENCH_ZIRION_BASE
  ? pathToFileURL(resolvePath(process.env.BENCH_ZIRION_BASE)).href
  : new URL('../build/esm/index.js', import.meta.url).href);
const alternateBuild = process.env.BENCH_ZIRION_BUILD
  ? await import(pathToFileURL(resolvePath(process.env.BENCH_ZIRION_BUILD)).href)
  : null;
const iterations = Number(process.env.BENCH_ITERATIONS || 200000);
const rounds = Number(process.env.BENCH_ROUNDS || 9);
if (!Number.isInteger(iterations) || iterations < 1 || !Number.isInteger(rounds) || rounds < 1) {
  throw new Error('BENCH_ITERATIONS and BENCH_ROUNDS must be positive integers');
}

function classes () {
  class Leaf {
    value = 1;
  }
  class Root {
    constructor (leaf) {
      this.leaf = leaf;
    }
  }

  return { Leaf, Root };
}

function setupZirion (synchronous, build) {
  const { Leaf, Root } = classes();
  const c = new build.Container()
    .add(Leaf, { scope: build.InjectScope.REQUEST })
    .add(Root, { inject: [Leaf], scope: build.InjectScope.REQUEST });

  return () => {
    const context = {};

    return () => synchronous ? c.getOrFailSync(Root, context) : c.getOrFail(Root, context);
  };
}

function setupAwilix () {
  const { Leaf, Root } = classes();
  const c = createContainer({ injectionMode: InjectionMode.CLASSIC });

  c.register({ leaf: asClass(Leaf).scoped(), root: asClass(Root).scoped() });

  return () => {
    const scope = c.createScope();

    return () => scope.resolve('root');
  };
}

function setupTsyringe () {
  const { Leaf, Root } = classes();
  tsyringeInjectable()(Leaf);
  tsyringeInject('leaf')(Root, undefined, 0);
  tsyringeInjectable()(Root);

  const c = tsyringeRoot.createChildContainer();

  c.register('leaf', { useClass: Leaf }, { lifecycle: Lifecycle.ContainerScoped });
  c.register('root', { useClass: Root }, { lifecycle: Lifecycle.ContainerScoped });

  return () => {
    const child = c.createChildContainer();

    return () => child.resolve('root');
  };
}

function assertInversifyScopeBoundary () {
  class Leaf {}
  class Root {
    constructor (first, second) {
      this.first = first;
      this.second = second;
    }
  }

  inversifyInjectable()(Leaf);
  inversifyInjectable()(Root);
  inversifyInject('leaf')(Root, undefined, 0);
  inversifyInject('leaf')(Root, undefined, 1);

  const c = new InversifyContainer();

  c.bind('leaf').to(Leaf).inRequestScope();
  c.bind('root').to(Root);

  const first = c.get('root');
  const second = c.get('root');

  if (first.first !== first.second || first.first === second.first) {
    throw new Error('Unexpected InversifyJS request-scope semantics');
  }
}

function assertScope (createRequest) {
  const firstRequest = createRequest();
  const secondRequest = createRequest();
  const first = firstRequest();
  const sameRequest = firstRequest();
  const second = secondRequest();

  return Promise.all([first, sameRequest, second]).then(([a, b, c]) => {
    if (!a || a.leaf?.value !== 1 || a !== b || a.leaf !== b.leaf || a === c || a.leaf === c.leaf) {
      throw new Error('Request scope lifetime mismatch');
    }
  });
}

function measureSync (resolve, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    checksum += resolve().leaf.value;
  }

  if (checksum !== count) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

async function measureAwait (resolve, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    checksum += (await resolve()).leaf.value;
  }

  if (checksum !== count) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

function measureNewSync (createRequest, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    const resolve = createRequest();
    const first = resolve();
    const second = resolve();

    if (first !== second) {
      throw new Error('Request value was not reused');
    }

    checksum += first.leaf.value + second.leaf.value;
  }

  if (checksum !== count * 2) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

async function measureNewAwait (createRequest, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    const resolve = createRequest();
    const first = await resolve();
    const second = await resolve();

    if (first !== second) {
      throw new Error('Request value was not reused');
    }

    checksum += first.leaf.value + second.leaf.value;
  }

  if (checksum !== count * 2) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

function median (values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const results = [];
assertInversifyScopeBoundary();

for (const mode of ['await', 'sync']) {
  const providers = [
    ['@zirion/ioc', setupZirion(mode === 'sync', baseBuild)],
    ...(alternateBuild
      ? [['@zirion/ioc (alternate)', setupZirion(mode === 'sync', alternateBuild)]]
      : []),
    ['Awilix', setupAwilix()],
    ['TSyringe', setupTsyringe()],
  ];

  for (const scenario of ['reuse', 'new']) {
    const cases = providers.map(([library, createRequest]) => ({
      library,
      createRequest,
      times: [],
    }));

    for (const item of cases) {
      await assertScope(item.createRequest);

      if (scenario === 'reuse') {
        const resolve = item.createRequest();

        if (mode === 'await') {
          await measureAwait(resolve, Math.min(iterations, 3000));
        } else {
          measureSync(resolve, Math.min(iterations, 3000));
        }

        item.resolve = resolve;
      } else if (mode === 'await') {
        await measureNewAwait(item.createRequest, Math.min(iterations, 3000));
      } else {
        measureNewSync(item.createRequest, Math.min(iterations, 3000));
      }
    }

    for (let round = 0; round < rounds; round++) {
      for (let offset = 0; offset < cases.length; offset++) {
        const item = cases[(round + offset) % cases.length];
        let ms;

        if (scenario === 'reuse') {
          ms = mode === 'await'
            ? await measureAwait(item.resolve, iterations)
            : measureSync(item.resolve, iterations);
        } else {
          ms = mode === 'await'
            ? await measureNewAwait(item.createRequest, iterations)
            : measureNewSync(item.createRequest, iterations);
        }

        item.times.push(ms);
      }
    }

    for (const item of cases) {
      const ms = median(item.times);

      results.push({
        scenario,
        mode,
        library: item.library,
        iterations,
        rounds,
        medianMs: Number(ms.toFixed(3)),
        opsPerSecond: Math.round(iterations / ms * 1000),
      });
    }
  }
}

console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  excluded: { InversifyJS: 'inRequestScope caches only within one get() call' },
  results,
}, null, 2));
