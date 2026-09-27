# Changelog

## [3.0.0] - Unreleased

- Cache singleton factory results even when they are `false`, `0`, `''`, `null`, `undefined`, or `NaN`.
- Preserve the order and duplicates in `inject`, including repeated selectors and different selectors that resolve to the same value.
- Add regression tests for singleton caching and dependency injection.
- Project migrated to TypeScript 6
