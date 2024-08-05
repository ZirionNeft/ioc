# @zirion/ioc
[![npm version](https://badge.fury.io/js/@zirion%2Fioc.svg)](https://badge.fury.io/js/@zirion%2Fioc)
[![codecov](https://codecov.io/gh/ZirionNeft/ioc/graph/badge.svg?token=7802XYCAVN)](https://codecov.io/gh/ZirionNeft/ioc)

An IoC (Inversion of Control) implementation using dependency injection for Node.js.

## Table of Contents
- [Installation](#installation)
- [Features](#features)
- [Usage](#usage)
- [Examples](#examples)
- [Contributing](#contributing)

## Installation
You can install the package using **npm** or **yarn**:

```bash
npm install @zirion/ioc
```
or
```bash
yarn add @zirion/ioc
```

## Features
- Lightweight and easy to use
- Supports constructor method injection
- Singleton and request lifetimes
- Dependency resolution
- Contexts for request-scoped providers
- Code is free from dependencies

### Roadmap:
- More ways to inject - property, method
- More lifetimes - transient
- Circular dependencies check
- Isolated dependency groups
- Lazy initialization configuration *(Currently all registered providers are lazy initable)*
- More lifecycle hooks
- Decorators Stage-3 support
- Tests
- In-code documentation
- More code examples in repository

## Usage
### Basic Usage

Firstly we have `container` constant exported from the package. It our first point where starting on
```ts
import container from '@zirion/ioc/container';

container.add('my_key', {
  value: {
    data: 'My first injectable object!',
  },
}).finalize();

const obj = container.get('my_key');

// My first injectable object!
console.log(obj.data);
```

Let's take a look to how to use a thing in the simpliest way:

```ts
import container from '@zirion/ioc/container'

class ThemService {
  // ...
}

class MyService {
  constructor(themService: ThemService) {
    // Yaay! We got injected
  }

  // ...
}

// There added new services into main container
// Note: By default providers are added as singleton
container
  // Providers order is important!
  .add(ThemService)
  .add(MyService, { inject: [ThemService] })
  // End builder with calling this function to run our hooks
  .finalize()

// Now we can use our instance. It's lazy - only be initied when we got them
const myService = container.get(MyService)
```

## Examples

Context scoped provider case:

```ts
import container from '@zirion/ioc/container'
import { InjectScope } from '@zirion/ioc';

class MyService {
  constructor(context) {
    // In request-scoped providers context got auto-injected as latest parameter in constructor
  }
}

container
  .add(MyService, { scope: InjectScope.REQUEST })
  .finalize()

const myContext = {
  reqId: 1,
  foo: 'bar',
}

// To use request-scoped instance it's required to pass a context in second argument
const myService = container.get(MyService, myContext);
```

Also, there is some rule:
- Request-scoped instance **CAN'T** be injected into singletone-scoped one

## Contributing
Contributions are welcome! Please read the [contribution guidelines](CONTRIBUTING.md) first.

## License

This project is licensed under the [MIT License](LICENSE).

