import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Container, InjectScope } from '../build/esm/index.js';


const CATALOG = Symbol('catalog');
const MAX_BODY_BYTES = 1024 * 1024;

class HttpError extends Error {
  constructor (status, message) {
    super(message);
    this.status = status;
  }
}

class OrderStore {
  #orders = [];
  #nextId = 1;

  get count () {
    return this.#orders.length;
  }

  list () {
    return [...this.#orders];
  }

  create (sku, quantity, unitPrice) {
    const order = { id: this.#nextId++, sku, quantity, unitPrice, total: quantity * unitPrice };
    this.#orders.push(order);

    return order;
  }
}

class RequestMetadata {
  constructor (context) {
    this.requestId = context.requestId;
    this.request = context.request;
  }

  onInitialized () {
    const language = this.request.headers['accept-language'];
    this.locale = typeof language === 'string' && language.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  }
}

class OrderService {
  constructor (catalog, orders, metadata) {
    this.catalog = catalog;
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

  listOrders () {
    return this.orders.list();
  }

  createOrder (input) {
    const sku = input?.sku;
    const quantity = input?.quantity;
    if (typeof sku !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new HttpError(400, 'Expected sku and quantity between 1 and 100');
    }
    const product = this.catalog.get(sku);
    if (!product) {throw new HttpError(404, 'Unknown product');}

    return this.orders.create(sku, quantity, product.price);
  }
}

function createContainer () {
  return new Container()
    .add(CATALOG, {
      scope: InjectScope.SINGLETON,
      valueFactory: async () => {
        const json = await readFile(new URL('./products.json', import.meta.url), 'utf8');
        const products = JSON.parse(json);

        return new Map(products.map(product => [product.sku, product]));
      },
    })
    .add(OrderStore, { scope: InjectScope.SINGLETON })
    .add(RequestMetadata, { scope: InjectScope.REQUEST })
    // No scope option: OrderService is transient by default.
    .add(OrderService, { inject: [CATALOG, OrderStore, RequestMetadata] });
}

async function readJson (request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {throw new HttpError(413, 'Request body is too large');}
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function sendJson (response, status, value) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(value));
}

export function createExampleServer () {
  const container = createContainer();

  return createServer(async (request, response) => {
    const context = { request, requestId: randomUUID() };
    response.setHeader('x-request-id', context.requestId);

    try {
      if (request.method === 'GET' && request.url === '/health') {
        // A synchronous singleton graph can be read without creating a Promise.
        const orders = container.getOrFailSync(OrderStore);
        sendJson(response, 200, { ok: true, orders: orders.count });

        return;
      }

      if (request.method === 'GET' && request.url === '/products') {
        // The same context makes RequestMetadata shared across these two resolutions.
        const metadata = await container.getOrFail(RequestMetadata, context);
        const service = await container.getOrFail(OrderService, context);
        response.setHeader('content-language', metadata.locale);
        sendJson(response, 200, service.listProducts());

        return;
      }

      if (request.method === 'GET' && request.url === '/orders') {
        const service = await container.getOrFail(OrderService, context);
        sendJson(response, 200, service.listOrders());

        return;
      }

      if (request.method === 'POST' && request.url === '/orders') {
        const input = await readJson(request);
        const service = await container.getOrFail(OrderService, context);
        sendJson(response, 201, service.createOrder(input));

        return;
      }

      throw new HttpError(404, 'Route not found');
    } catch (error) {
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.message });
      } else {
        console.error(error);
        sendJson(response, 500, { error: 'Internal server error' });
      }
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const server = createExampleServer();
  server.listen(port, '127.0.0.1', () => {
    console.log(`HTTP example listening at http://127.0.0.1:${server.address().port}`);
  });
}
