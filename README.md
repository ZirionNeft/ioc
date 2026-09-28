# @zirion/ioc

[![npm version](https://badge.fury.io/js/@zirion%2Fioc.svg)](https://badge.fury.io/js/@zirion%2Fioc)
[![codecov](https://codecov.io/gh/ZirionNeft/ioc/graph/badge.svg?token=7802XYCAVN)](https://codecov.io/gh/ZirionNeft/ioc)

An IoC container for Node.js with explicit dependency injection, async factories, and singleton, request, or transient providers.

- **No decorators or `reflect-metadata`.** List dependencies explicitly with `inject`.
- **Sync and async resolution.** Avoid promise overhead for synchronous graphs; await async factories and hooks when needed.
- **Scopes for services and HTTP requests.** Transient is the default; request instances are shared across resolutions with the same context object.
- **Small runtime footprint.** No runtime dependencies, TypeScript inference for chained registrations, and ESM and CommonJS exports.

> **Full documentation:** [Dependency Injection guide](https://if-else.dev/docs/dependency-injection/)

## Installation

Requires Node.js 20 or later.

```bash
npm install @zirion/ioc
```

## Quick start

```ts
import { Container, InjectScope } from '@zirion/ioc';

class Database {}
class UserService {
  constructor(readonly database: Database) {}
}

const container = new Container()
  .add(Database, { scope: InjectScope.SINGLETON })
  .add(UserService, { inject: [Database] });

const service = await container.getOrFail(UserService);
// For this synchronous graph: container.getOrFailSync(UserService)
```

Dependencies in `inject` follow constructor argument order. `getOrFail()` awaits async factories and lifecycle hooks; `getOrFailSync()` returns immediately for a fully synchronous graph. Independent async dependencies resolve in parallel.

## Scopes

| Scope | Lifetime |
| --- | --- |
| `TRANSIENT` (default) | New value for each resolution or injection. |
| `SINGLETON` | One shared value per container. |
| `REQUEST` | One value per context object, shared across separate resolutions. |

Pass the same context object to each `getOrFail(selector, context)` call within a request. The container does not create or close HTTP request contexts automatically.

For a runnable comparison server using all three scopes, see [benchmarks/http-orders.mjs](benchmarks/http-orders.mjs). TypeScript examples for Node HTTP, Express, and Fastify are in [examples](examples/README.md).

## Benchmarks

| Scenario score | @zirion/ioc | Awilix | InversifyJS | TSyringe |
| --- | ---: | ---: | ---: | ---: |
| Basic graph | 92.4 | 60.8 | 90.3 | 41.3 |
| Graph width | 85.4 | 68.5 | 100.0 | 46.8 |
| Request scope | 83.0 | 50.3 | 0.0 (N/A) | 77.5 |
| HTTP request | 98.7 | 97.8 | 98.1 | 100.0 |
| **Overall score** | **89.9** | **69.4** | **72.1** | **66.4** |

[Benchmark report and scoring methodology](docs/bench.md) · [Russian version](docs/bench.ru.md)

## Migration

[Migration guide: InversifyJS, Awilix, and TSyringe](docs/migration.md) · [Russian version](docs/migration.ru.md)

## Contributing

See the [contribution guidelines](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
