# Changelog

## [3.0.0] - Unreleased

- Cache singleton factory results even when they are `false`, `0`, `''`, `null`, `undefined`, or `NaN`.
- Preserve the order and duplicates in `inject`, including repeated selectors and different selectors that resolve to the same value.
- Add regression tests for singleton caching and dependency injection.
- Project migrated to TypeScript 6
- Fix the CommonJS package entry so `require('@zirion/ioc')` loads the built library.
- Share in-flight singleton and request-scoped resolutions between concurrent requests, and retry after factory failures.
- Detect circular `inject` dependencies and report them with error `CIRCULAR_DEPENDENCY`.
