import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express, { type NextFunction, type Request, type Response } from 'express';

import {
  createOrderContainer,
  createRequestContext,
  HttpError,
  OrderService,
  OrderStore,
  type RequestContext,
  resolveProducts,
} from './orders.js';


function contextOf (response: Response): RequestContext {
  return response.locals.diContext as RequestContext;
}

export function createExpressApp () {
  const app = express();
  const container = createOrderContainer();

  // Middleware creates one context for all handlers and resolutions in a request.
  app.use((request, response, next) => {
    const context = createRequestContext(request.headers);

    response.locals.diContext = context;
    response.setHeader('x-request-id', context.requestId);
    next();
  });

  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_request, response) => {
    const orders = container.getOrFailSync(OrderStore);

    response.json({ ok: true, orders: orders.count });
  });

  app.get('/products', async (_request, response) => {
    const { metadata, products } = await resolveProducts(container, contextOf(response));

    response.setHeader('content-language', metadata.locale);
    response.json(products);
  });

  app.get('/orders', async (_request, response) => {
    const service = await container.getOrFail(OrderService, contextOf(response));

    response.json(service.listOrders());
  });

  app.post('/orders', async (request, response) => {
    const service = await container.getOrFail(OrderService, contextOf(response));

    response.status(201).json(service.createOrder(request.body as unknown));
  });

  // Express 5 forwards rejected async handlers to this error middleware.
  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    if (error instanceof HttpError) {
      response.status(error.status).json({ error: error.message });

      return;
    }

    if (error instanceof SyntaxError && 'status' in error && error.status === 400) {
      response.status(400).json({ error: 'Invalid JSON' });

      return;
    }

    console.error(error);
    response.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3001);
  const server = createExpressApp().listen(port, '127.0.0.1', () => {
    const address = server.address();

    console.log(`Express example: http://127.0.0.1:${typeof address === 'object' ? address?.port : port}`);
  });
}
