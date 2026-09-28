import 'reflect-metadata';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';

import { createContainer, asClass, asFunction, asValue, InjectionMode } from 'awilix';
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

const { Container, InjectScope } = await import('../build/esm/index.js');

const iterations = Number(process.env.BENCH_ITERATIONS || 1000);
const rounds = Number(process.env.BENCH_ROUNDS || 7);
const warmup = Number(process.env.BENCH_WARMUP || 100);

if (
  ![iterations, rounds, warmup].every(Number.isInteger) ||
  iterations < 1 || rounds < 1 || warmup < 0
) {
  throw new Error('BENCH_ITERATIONS and BENCH_ROUNDS must be positive; BENCH_WARMUP must be nonnegative');
}

const products = JSON.parse(await readFile(new URL('./products.json', import.meta.url), 'utf8'));
const catalog = new Map(products.map(product => [product.sku, product]));
const CATALOG = 'catalog';
const ORDERS = 'orders';
const METADATA = 'metadata';
const SERVICE = 'service';

class OrderStore {
  count = 0;
}

class RequestMetadata {
  constructor (context) {
    this.requestId = context.requestId;
    this.locale = context.request.headers['accept-language']?.toLowerCase().startsWith('ru')
      ? 'ru'
      : 'en';
  }
}

class OrderService {
  constructor (productCatalog, orders, metadata) {
    this.catalog = productCatalog;
    this.orders = orders;
    this.metadata = metadata;
  }

  listProducts () {
    return [...this.catalog.values()].map(product => ({
      sku: product.sku,
      name: product.name[this.metadata.locale],
      price: product.price,
    }));
  }
}

function setupZirion () {
  const container = new Container()
    .add(CATALOG, { scope: InjectScope.SINGLETON, valueFactory: () => catalog })
    .add(ORDERS, { scope: InjectScope.SINGLETON, valueFactory: () => new OrderStore() })
    .add(METADATA, {
      scope: InjectScope.REQUEST,
      valueFactory: (_, context) => new RequestMetadata(context),
    })
    .add(SERVICE, {
      inject: [CATALOG, ORDERS, METADATA],
      valueFactory: ([resolvedCatalog, orders, metadata]) =>
        new OrderService(resolvedCatalog, orders, metadata),
    });

  return async context => {
    const metadata = await container.getOrFail(METADATA, context);
    const service = await container.getOrFail(SERVICE, context);

    return { metadata, service };
  };
}

function setupAwilix () {
  const container = createContainer({ injectionMode: InjectionMode.PROXY });
  container.register({
    catalog: asValue(catalog),
    orders: asClass(OrderStore).singleton(),
    metadata: asFunction(({ context }) => new RequestMetadata(context)).scoped(),
    service: asFunction(({ catalog: resolvedCatalog, orders, metadata }) =>
      new OrderService(resolvedCatalog, orders, metadata)).transient(),
  });

  return async context => {
    const scope = container.createScope();

    scope.register({ context: asValue(context) });

    const metadata = scope.resolve('metadata');
    const service = scope.resolve('service');

    return { metadata, service };
  };
}

function setupInversify () {
  inversifyInjectable()(OrderService);
  inversifyInject(CATALOG)(OrderService, undefined, 0);
  inversifyInject(ORDERS)(OrderService, undefined, 1);
  inversifyInject(METADATA)(OrderService, undefined, 2);

  const container = new InversifyContainer();

  container.bind(CATALOG).toConstantValue(catalog);
  container.bind(ORDERS).to(OrderStore).inSingletonScope();

  return async context => {
    // Inversify request scope ends after one get(). A child container supplies
    // the HTTP request lifetime across the two separate resolutions.
    const child = new InversifyContainer({ parent: container });

    child.bind(METADATA).toConstantValue(new RequestMetadata(context));
    child.bind(SERVICE).to(OrderService).inTransientScope();

    const metadata = child.get(METADATA);
    const service = child.get(SERVICE);

    return { metadata, service };
  };
}

function setupTsyringe () {
  tsyringeInject(CATALOG)(OrderService, undefined, 0);
  tsyringeInject(ORDERS)(OrderService, undefined, 1);
  tsyringeInject(METADATA)(OrderService, undefined, 2);
  tsyringeInjectable()(OrderService);

  const container = tsyringeRoot.createChildContainer();

  container.register(CATALOG, { useValue: catalog });
  container.register(ORDERS, { useClass: OrderStore }, { lifecycle: Lifecycle.Singleton });

  return async context => {
    const child = container.createChildContainer();

    child.register(METADATA, { useValue: new RequestMetadata(context) });
    child.register(SERVICE, { useClass: OrderService }, { lifecycle: Lifecycle.Transient });

    const metadata = child.resolve(METADATA);
    const service = child.resolve(SERVICE);

    return { metadata, service };
  };
}

const providers = [
  ['@zirion/ioc', setupZirion],
  ['Awilix', setupAwilix],
  ['InversifyJS', setupInversify],
  ['TSyringe', setupTsyringe],
];

function median (values) {
  return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
}

async function startServer (library, resolve) {
  let requestId = 0;

  const server = createServer(async (request, response) => {
    if (request.method !== 'GET' || request.url !== '/products') {
      response.writeHead(404).end();

      return;
    }

    try {
      const context = { request, requestId: String(++requestId) };

      const { metadata, service } = await resolve(context);

      if (
        metadata !== service.metadata ||
        service.catalog !== catalog ||
        !(service.orders instanceof OrderStore) ||
        metadata.requestId !== context.requestId
      ) {
        throw new Error('Graph or scope mismatch');
      }

      response.writeHead(200, {
        'content-type': 'application/json; charset=utf-8',
        'content-language': metadata.locale,
        'x-request-id': metadata.requestId,
      });
      response.end(JSON.stringify(service.listProducts()));
    } catch (error) {
      response.writeHead(500).end(`${library}: ${error}`);
    }
  });
  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });

  return server;
}

async function runRequests (url, count) {
  const start = performance.now();
  let previousId = 0;

  for (let i = 0; i < count; i++) {
    const response = await fetch(url, { headers: { 'accept-language': 'ru-RU' } });

    if (response.status !== 200) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    const id = Number(response.headers.get('x-request-id'));
    const body = await response.json();

    if (
      response.headers.get('content-language') !== 'ru' ||
      !Number.isInteger(id) || id <= previousId ||
      body.length !== 2 || body[0].name !== 'Кофе' || body[1].name !== 'Чай'
    ) {
      throw new Error('Incorrect HTTP response');
    }

    previousId = id;
  }

  return performance.now() - start;
}

const cases = [];
try {
  for (const [library, setup] of providers) {
    const server = await startServer(library, setup());

    cases.push({
      library,
      server,
      url: `http://127.0.0.1:${server.address().port}/products`,
      times: [],
    });
  }

  for (const item of cases) {
    await runRequests(item.url, warmup);
  }

  for (let round = 0; round < rounds; round++) {
    for (let offset = 0; offset < cases.length; offset++) {
      const item = cases[(round + offset) % cases.length];

      item.times.push(await runRequests(item.url, iterations));
    }
  }

  const results = cases.map(item => {
    const ms = median(item.times);

    return {
      library: item.library,
      iterations,
      rounds,
      warmup,
      medianMs: Number(ms.toFixed(3)),
      requestsPerSecond: Math.round(iterations / ms * 1000),
    };
  });

  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    scenario: 'GET /products over loopback HTTP; sequential keep-alive fetch; singleton/request/transient',
    results,
  }, null, 2));
} finally {
  await Promise.all(cases.map(item => new Promise((resolveClose, reject) => {
    item.server.close(error => {
      if (error) {
        reject(error);
      } else {
        resolveClose();
      }
    });
  })));
}
