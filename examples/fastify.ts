import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import Fastify from 'fastify';

import {
  createOrderContainer,
  createRequestContext,
  HttpError,
  OrderService,
  OrderStore,
  type RequestContext,
  resolveProducts,
} from './orders.js';


declare module 'fastify' {
  interface FastifyRequest {
    diContext: RequestContext;
  }
}

export function createFastifyApp () {
  const app = Fastify();
  const container = createOrderContainer();

  // The hook runs once for each HTTP request, before any route handler.
  app.addHook('onRequest', async (request, reply) => {
    request.diContext = createRequestContext(request.headers);
    reply.header('x-request-id', request.diContext.requestId);
  });

  app.get('/health', () => {
    const orders = container.getOrFailSync(OrderStore);

    return { ok: true, orders: orders.count };
  });

  app.get('/products', async (request, reply) => {
    const { metadata, products } = await resolveProducts(container, request.diContext);

    reply.header('content-language', metadata.locale);

    return products;
  });

  app.get('/orders', async request => {
    const service = await container.getOrFail(OrderService, request.diContext);

    return service.listOrders();
  });

  app.post('/orders', async (request, reply) => {
    const service = await container.getOrFail(OrderService, request.diContext);

    reply.code(201);

    return service.createOrder(request.body);
  });

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) {
      reply.code(error.status).send({ error: error.message });

      return;
    }

    if (error instanceof Error && 'statusCode' in error && error.statusCode === 400) {
      reply.code(400).send({ error: 'Invalid JSON' });

      return;
    }

    reply.log.error(error);
    reply.code(500).send({ error: 'Internal server error' });
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createFastifyApp();
  const port = Number(process.env.PORT ?? 3002);

  const address = await app.listen({ port, host: '127.0.0.1' });

  console.log(`Fastify example: ${address}`);
}
