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


const baseBuild = await import(process.env.BENCH_ZIRION_BASE
  ? pathToFileURL(resolvePath(process.env.BENCH_ZIRION_BASE)).href
  : new URL('../build/esm/index.js', import.meta.url).href);
const { Container, InjectScope } = baseBuild;

const alternateBuild = process.env.BENCH_ZIRION_BUILD
  ? await import(pathToFileURL(resolvePath(process.env.BENCH_ZIRION_BUILD)).href)
  : null;

const {
  Lifecycle,
  injectable: tsyringeInjectable,
  inject: tsyringeInject,
  container: tsyringeRoot,
} = tsyringe;

// One constructor dependency, equal lifetimes, and one await per resolution.
// Setup and correctness checks are outside the timed loop.
const iterations = Number(process.env.BENCH_ITERATIONS || 20000);
const rounds = Number(process.env.BENCH_ROUNDS || 7);
if (!Number.isInteger(iterations) || iterations < 1 || !Number.isInteger(rounds) || rounds < 1) {
  throw new Error('BENCH_ITERATIONS and BENCH_ROUNDS must be positive integers');
}

function classes () {
  class Leaf {
    constructor () {
      this.value = 1;
    }
  }
  class Root {
    constructor (leaf) {
      this.leaf = leaf;
    }
  }

  return { Leaf, Root };
}

function setupZirion (singleton, synchronous = false, ContainerType = Container, Scope = InjectScope) {
  const { Leaf, Root } = classes();
  const scope = singleton ? Scope.SINGLETON : Scope.TRANSIENT;

  const c = new ContainerType()
    .add(Leaf, { scope })
    .add(Root, { inject: [Leaf], scope });

  return synchronous ? () => c.getOrFailSync(Root) : () => c.getOrFail(Root);
}

function setupAwilix (singleton) {
  const { Leaf, Root } = classes();
  const c = createContainer({ injectionMode: InjectionMode.CLASSIC });
  const scoped = resolver => singleton ? resolver.singleton() : resolver.transient();

  c.register({ leaf: scoped(asClass(Leaf)), root: scoped(asClass(Root)) });

  return () => c.resolve('root');
}

function setupInversify (singleton) {
  const { Leaf, Root } = classes();
  inversifyInjectable()(Leaf);
  inversifyInjectable()(Root);
  inversifyInject('leaf')(Root, undefined, 0);

  const c = new InversifyContainer();
  const scoped = binding => singleton ? binding.inSingletonScope() : binding.inTransientScope();

  scoped(c.bind('leaf').to(Leaf));
  scoped(c.bind('root').to(Root));

  return () => c.get('root');
}

function setupTsyringe (singleton) {
  const { Leaf, Root } = classes();
  tsyringeInjectable()(Leaf);
  tsyringeInject('leaf')(Root, undefined, 0);
  tsyringeInjectable()(Root);

  const c = tsyringeRoot.createChildContainer();
  const lifecycle = singleton ? Lifecycle.Singleton : Lifecycle.Transient;

  c.register('leaf', { useClass: Leaf }, { lifecycle });
  c.register('root', { useClass: Root }, { lifecycle });

  return () => c.resolve('root');
}

const providers = [
  ['@zirion/ioc', setupZirion],
  ...(alternateBuild
    ? [['@zirion/ioc (alternate)', scope =>
      setupZirion(scope, false, alternateBuild.Container, alternateBuild.InjectScope)]]
    : []),
  ['Awilix', setupAwilix],
  ['InversifyJS', setupInversify],
  ['TSyringe', setupTsyringe],
];

async function run (resolve, n) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < n; i++) {
    const result = await resolve();
    checksum += result.leaf.value;
  }

  if (checksum !== n) {
    throw new Error(`Incorrect result: ${checksum}`);
  }

  return performance.now() - start;
}

function runSync (resolve, n) {
  let checksum = 0;
  const start = performance.now();

  for (let i = 0; i < n; i++) {
    checksum += resolve().leaf.value;
  }

  if (checksum !== n) {
    throw new Error(`Incorrect result: ${checksum}`);
  }

  return performance.now() - start;
}

function median (values) {
  const sorted = [...values].sort((a, b) => a - b);

  return sorted[Math.floor(sorted.length / 2)];
}

const results = [];
for (const singleton of [true, false]) {
  const cases = providers.map(([name, setup]) => ({
    name,
    resolve: setup(singleton),
    times: [],
  }));

  for (const item of cases) {
    const first = await item.resolve();
    const second = await item.resolve();

    if (
      !first || first.leaf.value !== 1 ||
      (first === second) !== singleton ||
      (first.leaf === second.leaf) !== singleton
    ) {
      throw new Error(`Lifetime or graph mismatch: ${item.name}`);
    }

    await run(item.resolve, Math.min(iterations, 3000));
  }

  for (let round = 0; round < rounds; round++) {
    for (let offset = 0; offset < cases.length; offset++) {
      const item = cases[(round + offset) % cases.length];
      item.times.push(await run(item.resolve, iterations));
    }
  }

  for (const item of cases) {
    const ms = median(item.times);

    results.push({
      scope: singleton ? 'singleton' : 'transient',
      library: item.name,
      iterations,
      rounds,
      medianMs: Number(ms.toFixed(3)),
      opsPerSecond: Math.round(iterations / ms * 1000),
    });
  }
}

const syncResults = [];
const syncProviders = [
  ['@zirion/ioc', scope => setupZirion(scope, true)],
  ...(alternateBuild
    ? [['@zirion/ioc (alternate)', scope =>
      setupZirion(scope, true, alternateBuild.Container, alternateBuild.InjectScope)]]
    : []),
  ['Awilix', setupAwilix],
  ['InversifyJS', setupInversify],
  ['TSyringe', setupTsyringe],
];
for (const singleton of [true, false]) {
  const cases = syncProviders.map(([name, setup]) => ({
    name,
    resolve: setup(singleton),
    times: [],
  }));

  for (const item of cases) {
    const first = item.resolve();
    const second = item.resolve();

    if (
      !first || first.leaf.value !== 1 ||
      (first === second) !== singleton ||
      (first.leaf === second.leaf) !== singleton
    ) {
      throw new Error(`Lifetime or graph mismatch: ${item.name}`);
    }

    runSync(item.resolve, Math.min(iterations, 3000));
  }

  for (let round = 0; round < rounds; round++) {
    for (let offset = 0; offset < cases.length; offset++) {
      const item = cases[(round + offset) % cases.length];
      item.times.push(runSync(item.resolve, iterations));
    }
  }

  for (const item of cases) {
    const ms = median(item.times);

    syncResults.push({
      scope: singleton ? 'singleton' : 'transient',
      library: item.name,
      iterations,
      rounds,
      medianMs: Number(ms.toFixed(3)),
      opsPerSecond: Math.round(iterations / ms * 1000),
    });
  }
}

console.log(JSON.stringify({
  node: process.version,
  platform: process.platform,
  arch: process.arch,
  awaitedResults: results,
  synchronousResults: syncResults,
}, null, 2));
