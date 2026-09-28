# Migrating to `@zirion/ioc`

[Русская версия](migration.ru.md). This guide covers a gradual migration from Awilix, InversifyJS, or TSyringe. For feature comparisons and measurements, see the [benchmark report](bench.md).

## General approach

Start with one composition root: select a few services to move and keep the old container for the rest. First, record each service's lifetime and who owns its resources. Place the async boundary in an HTTP handler, job runner, or application startup, where `await` is already possible.

In `@zirion/ioc`, `REQUEST` is tied to a context object and shared across separate `get` calls that receive that object. The container does not create HTTP contexts automatically: the application must pass the same object throughout a request. Check how your current container defines request scope before migrating registrations.

`get()` and `getOrFail()` return promises. Use `getSync()` or `getOrFailSync()` for a fully synchronous graph. If a factory, dependency, or `onInitialized()` hook is async, the synchronous call throws `ASYNC_RESOLUTION_REQUIRED`; move that call site to `await`. The synchronous call may start a factory before detecting its promise. Its pending singleton/request result remains available to a later async call.

Check graph constraints before switching: chained `add()` types do not prove at compile time that every `inject` entry is registered; missing dependencies and cycles are detected during resolution. A direct singleton → request dependency is forbidden, while a path through a transient is detected only when resolving the request dependency. A class's `onInitialized()` runs after its constructor, so move property injection or constructor-time initialization into explicit dependencies or a factory. Request values have no explicit cache removal or automatic resource cleanup.

## Awilix

Map `asClass(Service).scoped()` to `add(Service, { scope: InjectScope.REQUEST, inject: [...] })` if the application passes one context object to every resolution within an HTTP request. `.singleton()` maps to `InjectScope.SINGLETON`; `.transient()` matches the default scope.

In Awilix `PROXY` mode, a class receives a cradle object. To keep an existing constructor, use an adapter factory:

```ts
import { Container, InjectScope } from '@zirion/ioc';

declare function connectDb(): Promise<object>;

class Repo {
  constructor(readonly db: object) {}
}

const container = new Container()
  .add('db', { scope: InjectScope.SINGLETON, valueFactory: () => connectDb() })
  .add(Repo, {
    inject: ['db'],
    scope: InjectScope.REQUEST,
    valueFactory: ([db]) => new Repo(db),
  });

// In an HTTP handler, reuse one object for every resolution in this request.
const requestContext = { requestId: '123' };
const repo = await container.getOrFail(Repo, requestContext);
```

`connectDb()` is an application function. The application must close the singleton `db`; an Awilix `.disposer()` is not transferred automatically. If legacy code relies on a cradle with dynamic properties, keep an adapter at the module boundary and give new services explicit `inject` lists. See [Awilix lifetimes, scopes, and disposal](https://github.com/jeffijoe/awilix).

## InversifyJS

Keep each token (`string`, `symbol`, or class) and move `@inject(TOKEN)` declarations into an ordered `inject: [TOKEN]` list. Replace `getAsync` with `await getOrFail`, and synchronous `get` with `getOrFailSync` when the whole graph is synchronous.

InversifyJS `inRequestScope()` lasts for one `get` resolution tree; `@zirion/ioc` `REQUEST` also shares a value across separate `get` calls with the same context. Choose the intended semantics before migrating. Replace `getAll` with separate selectors and an array factory, for example `add('plugins', { inject: ['a', 'b'], valueFactory: deps => deps })`. Dynamic constraints and tags need a selection factory, or those modules can stay on InversifyJS temporarily. See [Inversify scopes](https://inversify.io/docs/fundamentals/binding/) and the [Container API](https://inversify.io/docs/api/container/).

## TSyringe

Replace `@injectable` and `@inject` with registrations that declare `inject`. `Lifecycle.ContainerScoped` usually maps to `REQUEST` when a context object is passed explicitly. `ResolutionScoped` lasts only for one resolution tree and is not equivalent to `REQUEST`.

`@injectAll`, interceptors, and `dispose()` need adapters or must remain in the old container. Remove `reflect-metadata` and decorator compiler options only after migrating every module that depends on them. See [TSyringe APIs and lifetimes](https://github.com/microsoft/tsyringe).

## Bridging a synchronous legacy API

You can register a legacy object with `valueFactory: () => legacy.resolve(Token)`. For a synchronous caller, use `modern.getOrFailSync(Token)` if the whole graph is synchronous. If it may return a promise, resolve the value ahead of time with `const service = await modern.getOrFail(Token); legacy.registerInstance(Token, service)`, or change the call site to `await`.

During the transition, assign one owner to each singleton and its cleanup so that two copies of a resource are not created. `@zirion/ioc` has no automatic counterpart to Awilix/TSyringe `dispose()`: `finalize()` calls `onFinalized()` but does not traverse request/transient objects to close them.
