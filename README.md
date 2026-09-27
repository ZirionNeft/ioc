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

## Constructor and factory injection

The `inject` array lists dependencies in argument order. Repeated selectors remain repeated arguments. Register every dependency before resolving its consumer; registration order does not otherwise matter.

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

## Provider scopes

### Singletone
Providers are singletons by default. The first request creates the value, and later requests receive the same result, including falsy values. Concurrent requests share the same creation. If a factory fails, a later request can retry.

### Request 
Request-scoped providers are created once per context object. Pass the same object to share an instance; a different object gets a different instance. A request-scoped provider cannot be injected into a singleton.

### Transient
Transient providers create a new value for every `get()` call and every injection, including concurrent calls. They do not require a context. You may pass one when a transient provider depends on a request-scoped provider. A singleton that injects a transient keeps the instance created when the singleton is first resolved.

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

const container = new Container().add(Service);
await container.finalize();
const service = await container.getOrFail(Service);
```

## Contributing

Contributions are welcome. Please read the [contribution guidelines](CONTRIBUTING.md) first.

## Changelog

See [CHANGELOG.md](CHANGELOG.md).

## License

This project is licensed under the [MIT License](LICENSE).
