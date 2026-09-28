# TypeScript HTTP examples

The same order service runs in three server stacks. [orders.ts](orders.ts) registers an async singleton product catalog loaded from [products.json](products.json), a singleton order store, request-scoped metadata, and a transient order service. Each adapter creates one context per HTTP request and passes it to every resolution in that request.

| Stack | Context boundary | Start command | Default port |
| --- | --- | --- | ---: |
| [Node HTTP](node-http.ts) | Request handler | `yarn example:node` | 3000 |
| [Express 5](express.ts) | Middleware via `response.locals` | `yarn example:express` | 3001 |
| [Fastify 5](fastify.ts) | `onRequest` hook | `yarn example:fastify` | 3002 |

From the repository root, install development dependencies, build the package, and check the examples:

```bash
yarn install
yarn build
yarn example:typecheck
```

Then run one server using the command in the table. Set `PORT` to override its port. Each server exposes the same endpoints:

```bash
curl -i -H 'Accept-Language: ru' http://127.0.0.1:3000/products
curl -i -X POST -H 'Content-Type: application/json' \
  -d '{"sku":"coffee","quantity":2}' http://127.0.0.1:3000/orders
curl -i http://127.0.0.1:3000/orders
curl -i http://127.0.0.1:3000/health
```

Replace `3000` with `3001` or `3002` for Express or Fastify. `GET /products` resolves request metadata and the transient service separately with the same context and checks that they share the metadata instance. `GET /health` resolves the synchronous singleton store with `getOrFailSync()`. Orders are kept in memory, so restarting a server clears them.

Express, Fastify, and the TypeScript runner are development dependencies of this repository; they are not runtime dependencies of `@zirion/ioc`. The JavaScript server used by the comparison documentation lives in [benchmarks/http-orders.mjs](../benchmarks/http-orders.mjs).
