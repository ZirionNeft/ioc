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
const sizes = (process.env.BENCH_GRAPH_SIZES || '0,1,2,4').split(',').map(Number);

if (
  !Number.isInteger(iterations) || iterations < 1 ||
  !Number.isInteger(rounds) || rounds < 1 ||
  sizes.length === 0 || sizes.some(size => ![0, 1, 2, 4].includes(size))
) {
  throw new Error('BENCH_ITERATIONS, BENCH_ROUNDS, or BENCH_GRAPH_SIZES is invalid');
}

function graph (size) {
  class A {
    value = 1;
  }
  class B {
    value = 1;
  }
  class C {
    value = 1;
  }
  class D {
    value = 1;
  }

  class Root0 {
    value = 1;
  }
  class Root1 {
    constructor (a) {
      this.a = a;
      this.value = a.value;
    }
  }
  class Root2 {
    constructor (a, b) {
      this.a = a;
      this.b = b;
      this.value = a.value + b.value;
    }
  }
  class Root4 {
    constructor (a, b, c, d) {
      this.a = a;
      this.b = b;
      this.c = c;
      this.d = d;
      this.value = a.value + b.value + c.value + d.value;
    }
  }

  const leaves = [A, B, C, D].slice(0, size);
  const Root = ({ 0: Root0, 1: Root1, 2: Root2, 4: Root4 })[size];
  const tokens = ['a', 'b', 'c', 'd'].slice(0, size);

  return { leaves, Root, tokens, expected: Math.max(1, size) };
}

function setupZirion (singleton, size, synchronous, build) {
  const { leaves, Root } = graph(size);
  const scope = singleton ? build.InjectScope.SINGLETON : build.InjectScope.TRANSIENT;
  let c = new build.Container();

  for (const leaf of leaves) {
    c = c.add(leaf, { scope });
  }

  c = c.add(Root, { scope, inject: leaves });

  return { resolve: () => synchronous ? c.getOrFailSync(Root) : c.getOrFail(Root), size };
}

function setupAwilix (singleton, size) {
  const { leaves, Root, tokens } = graph(size);
  const c = createContainer({ injectionMode: InjectionMode.CLASSIC });
  const scoped = resolver => singleton ? resolver.singleton() : resolver.transient();

  for (let i = 0; i < size; i++) {
    c.register(tokens[i], scoped(asClass(leaves[i])));
  }

  c.register('root', scoped(asClass(Root)));

  return { resolve: () => c.resolve('root'), size };
}

function setupInversify (singleton, size) {
  const { leaves, Root, tokens } = graph(size);

  for (const leaf of leaves) {
    inversifyInjectable()(leaf);
  }
  inversifyInjectable()(Root);

  for (let i = 0; i < size; i++) {
    inversifyInject(tokens[i])(Root, undefined, i);
  }

  const c = new InversifyContainer();
  const scoped = binding => singleton ? binding.inSingletonScope() : binding.inTransientScope();

  for (let i = 0; i < size; i++) {
    scoped(c.bind(tokens[i]).to(leaves[i]));
  }
  scoped(c.bind('root').to(Root));

  return { resolve: () => c.get('root'), size };
}

function setupTsyringe (singleton, size) {
  const { leaves, Root, tokens } = graph(size);

  for (const leaf of leaves) {
    tsyringeInjectable()(leaf);
  }
  for (let i = 0; i < size; i++) {
    tsyringeInject(tokens[i])(Root, undefined, i);
  }
  tsyringeInjectable()(Root);

  const c = tsyringeRoot.createChildContainer();
  const lifecycle = singleton ? Lifecycle.Singleton : Lifecycle.Transient;

  for (let i = 0; i < size; i++) {
    c.register(tokens[i], { useClass: leaves[i] }, { lifecycle });
  }
  c.register('root', { useClass: Root }, { lifecycle });

  return { resolve: () => c.resolve('root'), size };
}

function dependencies (root, size) {
  return ['a', 'b', 'c', 'd'].slice(0, size).map(key => root[key]);
}

function checkPair (first, second, singleton, size) {
  const expected = Math.max(1, size);
  const left = dependencies(first, size);
  const right = dependencies(second, size);

  if (
    !first || !second ||
    first.value !== expected || second.value !== expected ||
    (first === second) !== singleton ||
    left.some((value, i) =>
      !value || value.value !== 1 || (value === right[i]) !== singleton)
  ) {
    throw new Error('Graph or lifetime mismatch');
  }
}

async function measureAsync (resolve, size, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    checksum += (await resolve()).value;
  }

  if (checksum !== count * Math.max(1, size)) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

function measureSync (resolve, size, count) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < count; i++) {
    checksum += resolve().value;
  }

  if (checksum !== count * Math.max(1, size)) {
    throw new Error(`Incorrect checksum: ${checksum}`);
  }

  return performance.now() - start;
}

function median (values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

const providers = [
  ['@zirion/ioc', (singleton, size, synchronous) => setupZirion(singleton, size, synchronous, baseBuild)],
  ...(alternateBuild
    ? [['@zirion/ioc (alternate)', (singleton, size, synchronous) =>
      setupZirion(singleton, size, synchronous, alternateBuild)]]
    : []),
  ['Awilix', setupAwilix],
  ['InversifyJS', setupInversify],
  ['TSyringe', setupTsyringe],
];

const results = [];
for (const size of sizes) {
  for (const singleton of [true, false]) {
    for (const mode of ['await', 'sync']) {
      const cases = providers.map(([library, setup]) => ({
        library,
        ...setup(singleton, size, mode === 'sync'),
        times: [],
      }));

      for (const item of cases) {
        const first = mode === 'await' ? await item.resolve() : item.resolve();
        const second = mode === 'await' ? await item.resolve() : item.resolve();

        try {
          checkPair(first, second, singleton, size);
        } catch {
          throw new Error(`Graph or lifetime mismatch: ${item.library}, ${mode}, ${size}`);
        }

        if (mode === 'await') {
          await measureAsync(item.resolve, size, Math.min(iterations, 3000));
        } else {
          measureSync(item.resolve, size, Math.min(iterations, 3000));
        }
      }

      for (let round = 0; round < rounds; round++) {
        for (let offset = 0; offset < cases.length; offset++) {
          const item = cases[(round + offset) % cases.length];

          item.times.push(mode === 'await'
            ? await measureAsync(item.resolve, size, iterations)
            : measureSync(item.resolve, size, iterations));
        }
      }

      for (const item of cases) {
        const ms = median(item.times);

        results.push({
          dependencies: size,
          scope: singleton ? 'singleton' : 'transient',
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
}

const summaryResults = [];
for (const mode of ['await', 'sync']) {
  for (const [library] of providers) {
    const matching = results.filter(row =>
      row.scope === 'transient' && row.mode === mode && row.library === library);
    const zero = matching.find(row => row.dependencies === 0);
    const widths = [1, 2, 4].map(size => matching.find(row => row.dependencies === size));

    if (zero) {
      summaryResults.push({ ...zero, dependencies: '0' });
    }

    if (widths.every(Boolean)) {
      const geometricMean = Math.exp(widths.reduce((sum, row) =>
        sum + Math.log(row.opsPerSecond), 0) / widths.length);

      summaryResults.push({
        dependencies: '1/2/4',
        scope: 'transient',
        mode,
        library,
        aggregation: 'geometric mean',
        opsPerSecond: Math.round(geometricMean),
      });
    }
  }
}

console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  sizes,
  results,
  summaryResults,
}, null, 2));
