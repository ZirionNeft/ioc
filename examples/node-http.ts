import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  createOrderContainer,
  createRequestContext,
  HttpError,
  OrderService,
  OrderStore,
  resolveProducts,
} from './orders.js';


const MAX_BODY_BYTES = 1024 * 1024;

async function readJson (request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let bytes = 0;

  for await (const chunk of request) {
    bytes += chunk.length;

    if (bytes > MAX_BODY_BYTES) {
      throw new HttpError(413, 'Request body is too large');
    }

    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

function sendJson (response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(body));
}

export function createNodeServer () {
  const container = createOrderContainer();

  return createServer(async (request, response) => {
    // One context object is passed to every resolution within this HTTP request.
    const context = createRequestContext(request.headers);

    response.setHeader('x-request-id', context.requestId);

    try {
      if (request.method === 'GET' && request.url === '/health') {
        const orders = container.getOrFailSync(OrderStore);

        sendJson(response, 200, { ok: true, orders: orders.count });

        return;
      }

      if (request.method === 'GET' && request.url === '/products') {
        const { metadata, products } = await resolveProducts(container, context);

        response.setHeader('content-language', metadata.locale);
        sendJson(response, 200, products);

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
  const server = createNodeServer();
  const port = Number(process.env.PORT ?? 3000);

  server.listen(port, '127.0.0.1', () => {
    const address = server.address();

    console.log(`Node HTTP example: http://127.0.0.1:${typeof address === 'object' ? address?.port : port}`);
  });
}
