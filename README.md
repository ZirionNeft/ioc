# @zirion/ioc
[![npm version](https://badge.fury.io/js/@zirion%2Fioc.svg)](https://badge.fury.io/js/@zirion%2Fioc)
[![codecov](https://codecov.io/gh/ZirionNeft/ioc/graph/badge.svg?token=7802XYCAVN)](https://codecov.io/gh/ZirionNeft/ioc)

An IoC (Inversion of Control) container for Node.js with constructor injection, async factories, and singleton, request, or transient providers.

## Installation

Requires Node.js 20 or later.

```bash
npm install @zirion/ioc
```

Or use Yarn:

```bash
yarn add @zirion/ioc
```

The package supports both `import` and `require`.

## Basic usage

Register a value with `valueFactory`, then retrieve it asynchronously:

```ts
import { Container } from '@zirion/ioc';

const container = new Container()
  .add('message', {
    valueFactory: () => 'Hello from the container',
  });

const message = await container.getOrFail('message');
console.log(message); // Hello from the container
```

`get(selector)` returns `null` for an unregistered selector. `getOrFail(selector)` throws a `DependencyInjectionError` immediately if the selector is unregistered; it does not reject a registered factory's `null` result. Both methods return promises for registered selectors. An empty string is a valid selector.

For a graph that is fully synchronous, use `getSync(selector)` or `getOrFailSync(selector)` to receive the value immediately. These methods preserve the same missing-selector behavior as their async counterparts. If a factory, dependency, or `onInitialized()` hook returns a promise, they throw `DependencyInjectionError` with `ErrorCode.ASYNC_RESOLUTION_REQUIRED`; use `await get()` or `await getOrFail()` for that graph. A sync call may already have started an async factory before discovering the promise. Its pending singleton/request result remains available to a later async call.

```ts
const container = new Container().add('port', { valueFactory: () => 3000 });
const port = container.getOrFailSync('port'); // number, not Promise<number>
const samePort = await container.getOrFail('port');
```

The async methods still return promises, but synchronous factories and constructors run without intermediate async steps. Independent async dependencies continue resolving in parallel.

When you chain `add()`, TypeScript tracks registered selectors and infers the returned type from each class or factory. Keep the container returned by `add()` to retain this type information. For registrations that are only known at runtime, `Container<TSelector>` accepts dynamic selectors but cannot check string selector names or infer their result types.

## Constructor and factory injection

The `inject` array lists dependencies in argument order. Repeated selectors remain repeated arguments. Register every dependency before resolving its consumer; registration order does not otherwise matter. The container copies the array when you call `add()`, so later changes to the original array have no effect. Independent dependencies begin resolving in parallel, while their results retain the declared order. If one factory fails, already started sibling factories continue running.

```ts
import { Container } from '@zirion/ioc';

class Database {}

class UserService {
  constructor(readonly database: Database) {}
}

const container = new Container()
  .add(UserService, { inject: [Database] })
  .add(Database);

const service = await container.getOrFail(UserService);
console.log(service.database instanceof Database); // true
```

A factory receives resolved dependencies as an array and may return a value or a promise. A class returned by a factory is instantiated with the dependencies; an ordinary function returned by a factory remains a function value.

```ts
import { Container } from '@zirion/ioc';

const container = new Container()
  .add('host', { valueFactory: () => 'localhost' })
  .add('port', { valueFactory: () => 3000 })
  .add('address', {
    inject: ['host', 'port'],
    valueFactory: ([host, port]) => String(host) + ':' + String(port),
  });

console.log(await container.getOrFail('address')); // localhost:3000
```

Circular `inject` dependencies fail with `DependencyInjectionError` and the `ErrorCode.CIRCULAR_DEPENDENCY` code.
The container builds a dependency plan on first resolution and reuses it for later calls. It validates the whole registered `inject` graph before starting factories. Adding another provider clears cached plans, so a graph with a previously missing dependency can be resolved after that dependency is registered.

## Provider scopes

### Singleton
Set `scope: InjectScope.SINGLETON` to create a value once and reuse it, including falsy values. Concurrent requests share the same creation. If a factory fails, a later request can retry.

### Request 
Request-scoped providers are created once per context object. Pass the same object to share an instance; a different object gets a different instance. A request-scoped provider cannot be injected into a singleton.

### Transient
Providers are transient by default: each `get()` call and each injection creates a new value, including concurrent calls. They do not require a context. You may pass one when a transient provider depends on a request-scoped provider. A singleton that injects a transient keeps the instance created when the singleton is first resolved. Registrations that previously relied on the singleton default must now set `scope: InjectScope.SINGLETON` explicitly.

### Scopes example
```ts
import { Container, InjectScope } from '@zirion/ioc';

class RequestService {
  constructor(readonly context: Record<string, unknown>) {}
}

const container = new Container()
  .add(RequestService, { scope: InjectScope.REQUEST });

const context = { requestId: 1 };
const first = await container.getOrFail(RequestService, context);
const second = await container.getOrFail(RequestService, context);

console.log(first === second); // true
console.log(first.context === context); // true
```

The context is passed as the last constructor argument and as the second factory argument. Calling `get()` or `getOrFail()` for a request-scoped provider without a context throws `ErrorCode.REQUEST_SCOPE_CONTEXT_REQUIRED`.

```ts
import { Container, InjectScope } from '@zirion/ioc';

class Worker {}

const container = new Container()
  .add(Worker, { scope: InjectScope.TRANSIENT });

const first = await container.getOrFail(Worker);
const second = await container.getOrFail(Worker);
console.log(first === second); // false
```

For a runnable Node.js HTTP example combining singleton, request, and transient providers, see [the order server](examples/http-orders.mjs) and its [walkthrough](docs/comparison-and-migration.md#http-пример-со-всеми-scope).

## Lifecycle hooks

`onInitialized()` runs when an instance is created. An async hook is awaited before `get()` returns; a rejected hook makes the request fail and allows a later retry.

`finalize()` (also available as `build()`) awaits `onFinalized()` hooks on object selectors and singleton classes. It does not create request-scoped or transient classes; their `onFinalized()` hook is not called during finalization. You only need to call `finalize()` when using this hook.

```ts
import { Container } from '@zirion/ioc';

class Service {
  async onInitialized() {
    // Complete setup before the service is returned.
  }

  async onFinalized() {
    // Run when the container is finalized.
  }
}

const container = new Container().add(Service, { scope: InjectScope.SINGLETON });
await container.finalize();
const service = await container.getOrFail(Service);
```

## Contributing

Contributions are welcome. Please read the [contribution guidelines](CONTRIBUTING.md) first.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
