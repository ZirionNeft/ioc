# Changelog

## [3.0.0] - 2026-10-02

- Cache validated dependency plans and direct registration references for repeated resolution; rebuild plans after a new provider is registered.
- Resolve classes with zero or one dependency through a direct constructor path, avoiding per-resolution argument arrays and spread calls; retain async dependencies and initialization hooks.
- Change the default provider scope to `TRANSIENT`; registrations that need caching must explicitly select `SINGLETON`.
- Add `getSync()` and `getOrFailSync()` for synchronous graphs, with `ASYNC_RESOLUTION_REQUIRED` when a provider needs a promise.
- Resolve synchronous dependency paths without intermediate promises, skip `Promise.all` when unnecessary, and classify class selectors at registration instead of each resolution.
- Infer registered selector values in chained TypeScript container calls and reject unknown selectors at compile time; add a `typecheck` command for the public API.
- Resolve independent `inject` dependencies in parallel while preserving argument order and validating direct dependencies before starting factories.
- Cache successful cycle checks until registration changes, and snapshot each `inject` array at registration.
- Add the `TRANSIENT` scope to create a new value for each resolution or injection, with optional context forwarding to request-scoped dependencies.
- Cache singleton factory results even when they are `false`, `0`, `''`, `null`, `undefined`, or `NaN`.
- Preserve the order and duplicates in `inject`, including repeated selectors and different selectors that resolve to the same value.
- Add regression tests for singleton caching and dependency injection.
- Project migrated to TypeScript 6.
- Fix the CommonJS package entry so `require('@zirion/ioc')` loads the built library.
- Share in-flight singleton and request-scoped resolutions between concurrent requests, and retry after factory failures.
- Detect circular `inject` dependencies and report them with error `CIRCULAR_DEPENDENCY`.
- Allow an empty string as a selector and return ordinary functions from factories as values.
- Await asynchronous `onInitialized` hooks before returning an instance, and retry resolution if a hook fails.
- On `finalize()` process now skip request-scoped class instances that cannot be created without a context.
- Add reproducible container benchmarks, migration guides, and TypeScript integration examples for Node HTTP, Express, and Fastify.

## [2.0.0] - 2026-03-10

- Made container resolution asynchronous: `get()` and `getOrFail()` now return promises.
- Replaced provider `value` with an async-capable `valueFactory` API.
- Added typed container composition: each `add()` call carries registered selectors into the resulting container type.
- Added object selectors and support for factories that return either values or class constructors.
- Added configurable logging with a default console logger and exported logger interfaces.
- Added the `onInitialized` lifecycle hook and `build()` as an alias for `finalize()`.
- `finalize()` now supports registered objects as well as class instances and returns the built container.

## [1.3.0] - 2024-11-19

- Removed the package-level prebuilt container export; consumers now create their own `Container` instance.
- Improved return-type inference for class selectors in `get()` and `getOrFail()`.
- Simplified package exports and removed the `@zirion/ioc/container` entry point.
- Declared Node.js 18+ support and added browser compatibility metadata.
- Updated documentation and package discovery keywords.

## [1.2.1] - 2024-09-20

- Fixed the finalized lifecycle hook lookup: the container now correctly calls `onFinalized()`.
- Added test execution to the package release checks.
- Updated the TypeScript, ESLint, Vitest, and Node.js type toolchain.

## [1.2.0] - 2024-08-05

- Added structured `DependencyInjectionError` errors and exported error codes for container failures.
- Added validation for missing and duplicate targets, unknown selectors and scopes, and invalid resolvers.
- Added explicit errors for missing request contexts and invalid singleton-to-request dependency graphs.
- Fixed singleton caching so resolved instances are reused.
- Added utilities for readable selector names, broader test coverage, and coverage reporting.

## [1.1.2] - 2024-07-14

- Maintenance publication aligning the package version metadata with the npm release.

## [1.1.1] - 2024-07-14

- Reworked the package structure and public entry points.
- Added separate CommonJS, ES module, and declaration builds.
- Added package documentation, usage examples, and contributing guidelines.
- Added dependency update and stale-issue automation for the repository.

## [1.0.0] - 2024-07-14

- Initial npm release of the IoC container.
- Added provider registration and lazy dependency resolution.
- Added constructor injection with singleton and request-scoped lifetimes.
- Added context-based caching for request-scoped providers and the `onFinalized` lifecycle contract.
