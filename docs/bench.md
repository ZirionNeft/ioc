# IoC container comparison and benchmarks

[Русская версия](bench.ru.md). These results were obtained on September 27, 2026 from the current `@zirion/ioc` code (version 3.0.0).

## Participants

| Container | Strength | Relevant difference |
| --- | --- | --- |
| [Awilix](https://github.com/jeffijoe/awilix) | Class and function registration, child scopes, and disposers; useful for Node.js HTTP applications. | Resolution is synchronous: a factory returning a promise does not make the entire async dependency graph awaitable. |
| [InversifyJS](https://inversify.io/docs/fundamentals/binding/) | Multiple bindings per token, constraints, decorators, and sync/async resolution. | `inRequestScope()` caches within one `get` resolution tree, not across calls in one HTTP request. |
| [TSyringe](https://github.com/microsoft/tsyringe) | Constructor injection, child containers, and several lifetimes. | Requires decorators and `reflect-metadata`; it does not automatically await an async graph. |

`@zirion/ioc` uses explicit `inject` lists without decorators, offers `getSync` and `get` with async graph resolution, and supports singleton, transient, and context-keyed request scopes. One selector has one registration; there is no `getAll`, named bindings, child containers, or automatic cleanup of request/transient resources. See the [migration guide](migration.md) for practical differences.

## Methodology

Platform: macOS arm64, Node.js v24.19.0. Competitor versions are pinned in the [lockfile](../benchmarks/package-lock.json): Awilix 13.0.5, InversifyJS 8.2.3, and TSyringe 4.10.0. The `@zirion/ioc` build targets ES2022. Container registration is excluded from A–C; their graphs are warmed up and checked for correct values and lifetimes. D includes request-scope creation, HTTP, and response serialization, but excludes server startup.

The underlying A–C measurements use the **median** round; the combined B rows also aggregate widths 1/2/4. D reports the geometric mean of two independent runs. `await` and sync calls are measured separately. A and B are in millions of resolutions/s; C states its unit per row; D is in HTTP requests/s. Absolute throughput must not be compared across scenarios because each does different work.

## A. Basic graph

One resolution of `Root → Leaf`, with both classes either singleton or transient. Each container runs 9 rounds of 200,000 resolutions; the order of participants rotates between rounds. Awilix uses `CLASSIC` injection. Values are **millions of resolutions/s**. [Benchmark code](../benchmarks/compare.mjs).

| Lifetime / call | `@zirion/ioc` | Awilix | InversifyJS | TSyringe |
| --- | ---: | ---: | ---: | ---: |
| Singleton, `await` | 15.59 | 16.22 | 16.87 | 9.73 |
| Transient, `await` | 10.71 | 5.44 | 11.52 | 4.70 |
| Singleton, sync | 72.36 | 29.92 | 44.32 | 16.19 |
| Transient, sync | 9.43 | 6.55 | 11.20 | 4.96 |

`@zirion/ioc` leads on sync singletons, while InversifyJS leads on transient resolution. This scenario measures warm lookup and construction of a small graph, without async factories or I/O.

## B. Transient graph width

`Root` has 0, 1, 2, or 4 **independent** dependencies. Each variant runs 9 rounds of 200,000 resolutions. Widths 1/2/4 are collapsed into a geometric mean of throughput; the original rows remain in the [benchmark's](../benchmarks/compare-graphs.mjs) JSON output. Values are **millions of resolutions/s**.

| Dependencies | Call | `@zirion/ioc` | Awilix | InversifyJS | TSyringe |
| --- | --- | ---: | ---: | ---: | ---: |
| 0 | `await` | 12.97 | 10.96 | 13.58 | 7.57 |
| 0 | sync | 18.95 | 14.67 | 20.10 | 9.12 |
| 1/2/4, geometric mean | `await` | 4.93 | 3.84 | 6.66 | 2.79 |
| 1/2/4, geometric mean | sync | 5.02 | 4.04 | 6.45 | 2.85 |

InversifyJS is faster on wider graphs. The geometric mean gives each width equal weight. The classes used in A and B differ, so their absolute throughput should not be compared directly. Separate [tests](../test/resolution-shapes.test.ts) cover dependency order, context, parallel async branches, and resolution errors.

## C. Request scope

`Root → Leaf`, with both classes request-scoped. “Same request” repeatedly resolves an already-created `Root` using one context/child container, in **millions of resolutions/s**. “New request” creates a scope and resolves twice while checking reuse, in **millions of requests/s**. Each variant runs 9 rounds of 200,000 operations. [Benchmark code](../benchmarks/compare-request.mjs).

| Scenario | Call | `@zirion/ioc` | Awilix | InversifyJS | TSyringe |
| --- | --- | ---: | ---: | --- | ---: |
| Same request | `await` | 14.80 | 11.06 | N/A | 9.44 |
| Same request | sync | 35.34 | 19.31 | N/A | 16.32 |
| New request | `await` | 1.52 | 0.79 | N/A | 2.03 |
| New request | sync | 1.34 | 0.77 | N/A | 2.34 |

InversifyJS is marked N/A because its `inRequestScope()` does not share a value across separate `get` calls; the benchmark checks this behavior. A child-container adapter is possible but changes registration. That adapter is included in D.

## D. HTTP request

The [HTTP benchmark](../benchmarks/compare-http.mjs) sends a real `GET /products` with `fetch` to `127.0.0.1`. All containers use the same handler and response model: a singleton catalog and order store, request-scoped language metadata, and a transient service. The handler resolves metadata and the service separately and checks that the service receives the same request instance. The client checks the status, language, products, and `X-Request-ID`. InversifyJS creates a child container for each request; that cost is included.

Client and server run in one process. Requests are sent **sequentially** over a keep-alive connection. Each of the two independent runs uses 200 warmup requests, then 7 rounds of 1,500 requests per container. Throughput for each run is calculated from the median round time; the last column is the geometric mean of the two rates. Unit: **HTTP requests/s**.

| Container | Run 1 | Run 2 | Geometric mean |
| --- | ---: | ---: | ---: |
| `@zirion/ioc` | 700 | 696 | 698.0 |
| Awilix | 680 | 704 | 691.9 |
| InversifyJS | 676 | 712 | 693.8 |
| TSyringe | 692 | 723 | 707.3 |

**Result:** the ranking changed between runs, and differences between geometric means are smaller than run-to-run variation. This does not establish a consistent HTTP advantage for any container. HTTP, `fetch`, and JSON time obscure some DI differences. This normalized route is based on the example below but excludes first-request file loading, random UUID generation, and order writes. Concurrent load was not measured.

## Overall score

Within each A–D row, the leader receives 100 points and the others receive `100 × throughput / leader throughput`. A group score averages its rows: A, B, and C each have four; D has one. The **overall score averages the four groups with equal weight**, before rounding row and group scores. This avoids directly adding unlike throughput units. It combines speed and scenario coverage for this particular selection; it is not a general ranking of container quality.

| Group | `@zirion/ioc` | Awilix | InversifyJS | TSyringe |
| --- | ---: | ---: | ---: | ---: |
| A. Basic graph | 92.4 | 60.8 | 90.3 | 41.3 |
| B. Graph width | 85.4 | 68.5 | 100.0 | 46.8 |
| C. Request scope | 83.0 | 50.3 | 0.0† | 77.5 |
| D. HTTP request | 98.7 | 97.8 | 98.1 | 100.0 |
| Rows covered | 13/13 | 13/13 | 9/13 | 13/13 |
| **Overall** | **89.9** | **69.4** | **72.1**† | **66.4** |

† The four missing C rows count as zero **only in the coverage-adjusted overall score**. They do not imply zero InversifyJS throughput. Its average score on the shared A, B, and D groups is 96.1.

## Reproduction and limits

From the repository root:

```bash
yarn build
npm ci --prefix benchmarks
cd benchmarks
BENCH_ITERATIONS=200000 BENCH_ROUNDS=9 node compare.mjs
BENCH_ITERATIONS=200000 BENCH_ROUNDS=9 node compare-graphs.mjs
BENCH_ITERATIONS=200000 BENCH_ROUNDS=9 node compare-request.mjs
BENCH_ITERATIONS=1500 BENCH_ROUNDS=7 BENCH_WARMUP=200 node compare-http.mjs
```

Run the last command twice for D and take the geometric mean of `requestsPerSecond`. The benchmarks print JSON; `compare-graphs.mjs` includes raw results and `summaryResults`. Cold startup, frequent registration, memory use, deep graphs, concurrent HTTP requests, and other supported Node.js versions were not measured separately. Async factories and hooks are covered by tests but are not included in a competitive benchmark because their full-graph waiting semantics differ. [V8 discusses the limits of synthetic benchmarks](https://v8.dev/blog/real-world-performance).

## HTTP example with all scopes

Runnable application: the [order server](../benchmarks/http-orders.mjs) and [product catalog](../benchmarks/products.json). It creates one container for the server and a new context for each HTTP request. An async singleton factory loads the catalog on first use; a singleton store keeps orders across requests; `RequestMetadata` is shared within a request; and `OrderService` is transient by default. `GET /health` uses synchronous resolution.

```bash
yarn build
node benchmarks/http-orders.mjs
```

A checked `createExampleServer()` run returned: `GET /health` — 200 with zero orders; `GET /products` — 200 with Russian or English names according to `Accept-Language`; `POST /orders` for two coffees — 201 with a total of 500; subsequent `GET /orders` and `GET /health` showed the new order. Malformed JSON returned 400, and an unknown SKU returned 404. Every response had a distinct `X-Request-ID`. The store lives only in process memory. This functional example is separate from the normalized HTTP scenario D.

For application integrations written in TypeScript, see the [Node HTTP, Express, and Fastify examples](../examples/README.md).
