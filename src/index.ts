import { DEFAULT_PROVIDER_OPTIONS, InjectScope } from './constants.js';
import { ErrorCode } from './errors/constants.js';
import { DependencyInjectionError } from './errors/dependency-injection.error.js';
import { ConsoleLoggerImpl } from './logger/console-logger.impl.js';
import type { ILogger } from './logger/types.js';
import type {
  IOnFinalized,
  MaybePromise,
  TContainerOptions,
  TFactoryResult,
  TRegisteredValue,
  TRegistration,
  TResolutionCache,
  TSelector,
  TStorageEntry,
  TTargetOptions,
  Type,
} from './types.js';
import { isClassConstructor, targetName } from './utils.js';


export const DEFAULT_OPTIONS: TContainerOptions = {
  logger: ConsoleLoggerImpl,
};

function isClassValue (value: unknown): value is Type {
  return typeof value === 'function' &&
    Object.getOwnPropertyDescriptor(value, 'prototype')?.writable === false;
}

function isPromiseLike<Value> (value: Value | PromiseLike<Value>): value is PromiseLike<Value> {
  return value !== null &&
    (typeof value === 'object' || typeof value === 'function') &&
    typeof (value as PromiseLike<Value>).then === 'function';
}

type TResolutionPlan = {
  selector: TSelector;
  entry: TStorageEntry<TSelector>;
  dependencies: TResolutionPlan[];
};

export class Container<Items extends TSelector = never, Registrations = never> {
  readonly #storage = new Map<TSelector, TStorageEntry<TSelector>>();

  readonly #plans = new Map<TSelector, TResolutionPlan>();

  readonly #options: TContainerOptions;

  #logger!: ILogger;

  constructor (options: Partial<TContainerOptions> = {}) {
    this.#options = {
      ...DEFAULT_OPTIONS,
      ...options,
    };

    this.#initLogger();
  }

  get logger () {
    return this.#logger;
  }

  /**
   * Adds a new provider to the container storage.
   * The provider is identified by `target`, and has the specific `options` configured.
   *
   * The method throws an error if the `target` is not provided or if the `target` already exists in the storage.
   *
   * Request-scoped providers cache one result per context object. Providers are
   * transient-scoped by default, and dependencies may be registered in any order
   * before the provider is resolved. The inject array is copied at registration.
   * Keep the returned container to retain inferred selector and value types.
   *
   * @template Selector - The type that extends TSelector.
   *
   * @param {Selector} target - The identifier used for the provider.
   * @param {TTargetOptions} [options={}] - Additional configuration for the provider.
   *
   * @throws {DependencyInjectionError} - If `target` is not provided or already exists in the container.
   *
   * @returns {Container} - The container instance for method chaining.
   */
  add<
    const Selector extends TSelector,
    Factory extends (...args: any[]) => any,
  > (
    target: Selector,
    options: TTargetOptions<TSelector> & { valueFactory: Factory },
  ): Container<Items | Selector, Registrations | TRegistration<Selector, TFactoryResult<Factory>>>;
  add<const Selector extends TSelector> (
    target: Selector,
    options?: TTargetOptions<TSelector>,
  ): Container<Items | Selector, Registrations | TRegistration<Selector, Selector extends Type<infer Instance> ? Instance : unknown>>;
  add (
    target: TSelector,
    options: TTargetOptions<TSelector> = {},
  ): Container<any, any> {
    options = {
      ...DEFAULT_PROVIDER_OPTIONS,
      ...options,
    } as TTargetOptions<TSelector>;

    if (target === null || target === undefined) {
      throw new DependencyInjectionError(
        ErrorCode.TARGET_NULL,
        `Provider target '${targetName(target)}' is null or undefined`,
      );
    }

    if (this.#storage.has(target)) {
      throw new DependencyInjectionError(
        ErrorCode.TARGET_DUPLICATE,
        `Selector for target '${targetName(target)}' already registered.`,
      );
    }

    const storageEntry = {
      valueFactory: options.valueFactory ?? null,
      inject: options.inject ? [...options.inject] : options.inject,
      scope: options.scope,
      isConstructor: !options.valueFactory && isClassConstructor(target),
    } as TStorageEntry<TSelector>;

    if (storageEntry.scope === InjectScope.REQUEST) {
      storageEntry.contextMap = new WeakMap();
    }

    this.#storage.set(target, storageEntry);
    this.#plans.clear();

    return this as Container<any, any>;
  }

  /**
   * This method gets an instance of the class or value associated with the provided selector from the container.
   * It throws an error if the selector has not been registered in the container.
   * This registration check is synchronous; resolution is asynchronous. A registered
   * factory may still return null. Request-scoped providers require a context.
   *
   * @template {TSelector} Selector - The type that extends TSelector.
   * @template {Record<any, any>} Context - The type representing the context object provided when the provider is request-scoped.
   *
   * @param {Selector} selector - The class/constructor or value to get from the container.
   * @param {Context} [context] - Required for request scope; optional for transient dependencies.
   *
   * @throws {DependencyInjectionError} - If the target has not been registered in the container.
   *
   * @returns {Promise<Result>} - The instance associated with the selector.
   */
  getOrFail<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
  > (selector: Selector, context?: Context): Promise<TRegisteredValue<Registrations, Selector>> {
    if (!this.#storage.has(selector)) {
      throw new DependencyInjectionError(
        ErrorCode.UNKNOWN_TARGET,
        `Target with selector '${targetName(selector)}' is not registered`,
      );
    }

    return this.get<Context, Selector>(
      selector,
      context,
    ) as Promise<TRegisteredValue<Registrations, Selector>>;
  }

  /**
   * This method gets an instance of the class or value associated with the provided selector from the container.
   * It returns null if the selector has not been registered in the container.
   * A registered factory may also return null. Concurrent requests for the same
   * singleton or request context share one in-progress resolution.
   *
   * @template {TSelector} Selector - The type that extends TSelector.
   * @template {Record<any, any>} Context - The type representing the context object provided when the provider is request-scoped.
   *
   * @param {Selector} selector - The class/constructor or value to get from the container.
   * @param {Context} [context] - Required for request scope; optional for transient dependencies.
   * @returns {Promise<Result | null>} - The instance associated with the selector if it exists, otherwise null.
   */
  get<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
  > (selector: Selector, context?: Context): Promise<TRegisteredValue<Registrations, Selector> | null> {
    try {
      return Promise.resolve(this.#resolve(selector, context)) as Promise<
        TRegisteredValue<Registrations, Selector> | null
      >;
    } catch (error) {
      return Promise.reject(error);
    }
  }

  /** Resolve a registered synchronous graph without returning a Promise.
   * Throws `ASYNC_RESOLUTION_REQUIRED` if a factory, dependency, or initialization
   * hook returns a Promise. A started asynchronous provider remains available to
   * a later `get()` call; use `get()` when the graph may be asynchronous.
   */
  getSync<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
  > (selector: Selector, context?: Context): TRegisteredValue<Registrations, Selector> | null {
    const result = this.#resolve(selector, context);

    if (isPromiseLike(result)) {
      void Promise.resolve(result).catch(() => {});
      throw new DependencyInjectionError(
        ErrorCode.ASYNC_RESOLUTION_REQUIRED,
        `Target '${targetName(selector)}' needs asynchronous resolution; use get() or getOrFail()`,
        selector,
      );
    }

    return result as TRegisteredValue<Registrations, Selector> | null;
  }

  /** Like `getSync()`, but throws `UNKNOWN_TARGET` for an unregistered selector. */
  getOrFailSync<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
  > (selector: Selector, context?: Context): TRegisteredValue<Registrations, Selector> {
    this.#assertRegistered(selector);

    return this.getSync<Context, Selector>(selector, context) as TRegisteredValue<Registrations, Selector>;
  }

  /**
   * Run onFinalized hooks for object selectors and singleton classes.
   * Request-scoped and transient classes are not constructed here.
   * Call this after registering providers if those hooks are used.
   * @returns The container after all applicable hooks have completed.
   */
  async finalize (): Promise<Container<Items, Registrations>> {
    for (const [target, storageEntry] of this.#storage) {
      if (
        typeof target === 'object' &&
        typeof (target as Record<any, any>).onFinalized === 'function'
      ) {
        await (target as IOnFinalized).onFinalized();
        continue;
      }

      if (
        storageEntry.scope === InjectScope.SINGLETON &&
        isClassConstructor(target) &&
        typeof (target as Record<any, any>)?.prototype?.onFinalized ===
          'function'
      ) {
        const instance = await this.get(target as Items) as IOnFinalized | null;
        await instance?.onFinalized();
      }
    }

    return this;
  }

  /**
   * Alias for `finalize()`.
   * @returns The container after all applicable hooks have completed.
   */
  async build (): Promise<Container<Items, Registrations>> {
    return this.finalize();
  }

  #assertRegistered (selector: TSelector): void {
    if (!this.#storage.has(selector)) {
      throw new DependencyInjectionError(
        ErrorCode.UNKNOWN_TARGET,
        `Target with selector '${targetName(selector)}' is not registered`,
      );
    }
  }

  #resolve (selector: TSelector, context?: Record<any, any>): MaybePromise<any> | null {
    const plan = this.#plans.get(selector) ?? this.#buildPlan(selector);

    if (!plan) {
      return null;
    }

    // The common warm singleton lookup needs neither scope dispatch nor graph traversal.
    if (plan.entry.scope === InjectScope.SINGLETON && plan.entry.cache) {
      const cache = plan.entry.cache;

      return cache.state === 'ready' ? cache.value : cache.promise;
    }

    return this.#executePlan(plan, context);
  }

  #executePlan (plan: TResolutionPlan, context?: Record<any, any>): MaybePromise<any> {
    const { selector, entry } = plan;

    switch (entry.scope) {
      case InjectScope.SINGLETON:
        if (entry.cache) {
          return entry.cache.state === 'ready' ? entry.cache.value : entry.cache.promise;
        }

        return this.#cacheResult(
          this.#create(plan),
          cache => { entry.cache = cache; },
        );

      case InjectScope.REQUEST: {
        if (!context || typeof context !== 'object') {
          throw new DependencyInjectionError(
            ErrorCode.REQUEST_SCOPE_CONTEXT_REQUIRED,
            `Target '${targetName(selector)}' is request-scoped and must have context object as second argument in get() call`,
            selector,
          );
        }

        const requestEntry = entry as TStorageEntry<Items, any, InjectScope.REQUEST>;
        const cached = requestEntry.contextMap.get(context);

        if (cached) {
          return cached.state === 'ready' ? cached.value : cached.promise;
        }

        return this.#cacheResult(
          this.#create(plan, context),
          cache => {
            if (cache) {
              requestEntry.contextMap.set(context, cache);
            } else {
              requestEntry.contextMap.delete(context);
            }
          },
        );
      }

      case InjectScope.TRANSIENT:
        return this.#create(plan, context);

      default:
        throw new DependencyInjectionError(
          ErrorCode.UNKNOWN_SCOPE,
          `Unknown scope '${entry.scope}' of target '${targetName(selector)}'`,
          selector,
        );
    }
  }

  #cacheResult<Value> (
    result: MaybePromise<Value>,
    update: (cache: TResolutionCache<Value> | undefined) => void,
  ): MaybePromise<Value> {
    if (!isPromiseLike(result)) {
      update({ state: 'ready', value: result });

      return result;
    }

    const pending = Promise.resolve(result).then(
      value => {
        update({ state: 'ready', value });

        return value;
      },
      error => {
        update(undefined);
        throw error;
      },
    );
    update({ state: 'pending', promise: pending });
    // A sync caller cannot await this work; keep its rejection handled until
    // an async caller observes the same promise or a later call retries it.
    void pending.catch(() => {});

    return pending;
  }

  #buildPlan (selector: TSelector): TResolutionPlan | undefined {
    if (!this.#storage.has(selector)) {
      return undefined;
    }

    const built = new Map<TSelector, TResolutionPlan>();
    const active = new Map<TSelector, number>();
    const path: TSelector[] = [];

    const visit = (target: TSelector, parent?: TResolutionPlan): TResolutionPlan => {
      const cycleStart = active.get(target);

      if (cycleStart !== undefined) {
        const cycle = [...path.slice(cycleStart), target];
        throw new DependencyInjectionError(
          ErrorCode.CIRCULAR_DEPENDENCY,
          `Circular dependency: ${cycle.map(targetName).join(' -> ')}`,
          selector,
          target,
        );
      }

      const entry = this.#storage.get(target);

      if (!entry) {
        throw new DependencyInjectionError(
          ErrorCode.UNKNOWN_TARGET,
          `Unknown instance provider '${targetName(target)}' ` +
          `when resolving target '${targetName(parent?.selector)}'. ` +
          'Make sure that in container dependency is registered before resolution.',
        );
      }

      if (parent?.entry.scope === InjectScope.SINGLETON && entry.scope === InjectScope.REQUEST) {
        throw new DependencyInjectionError(
          ErrorCode.SINGLETONE_SCOPE_WRONG_CONTEXT,
          `Provider '${targetName(parent.selector)}' is singleton and can't have request-scoped dependencies '${targetName(target)}'`,
        );
      }

      const cached = built.get(target) ?? this.#plans.get(target);

      if (cached) {
        return cached;
      }

      const plan: TResolutionPlan = { selector: target, entry, dependencies: [] };
      active.set(target, path.length);
      path.push(target);

      for (const dependency of entry.inject ?? []) {
        plan.dependencies.push(visit(dependency, plan));
      }

      path.pop();
      active.delete(target);
      built.set(target, plan);

      return plan;
    };

    const root = visit(selector);

    for (const [target, plan] of built) {
      this.#plans.set(target, plan);
    }

    return root;
  }

  #create<Context extends Record<any, any> = any> (
    plan: TResolutionPlan,
    context?: Context,
  ): MaybePromise<any> {
    const { selector: target, entry: storageEntry } = plan;

    if (
      (storageEntry.valueFactory && typeof storageEntry.valueFactory !== 'function') ||
      (!storageEntry.valueFactory && !storageEntry.isConstructor)
    ) {
      throw new DependencyInjectionError(
        ErrorCode.TARGET_TYPE_BAD_RESOLVER,
        `Target '${targetName(target)}' must have 'valueFactory' or be a class constructor`,
        target,
      );
    }

    if (!storageEntry.valueFactory && plan.dependencies.length === 0) {
      return this.#initialize(new (target as Type)(context));
    }

    if (!storageEntry.valueFactory && plan.dependencies.length === 1) {
      const dependency = this.#executePlan(plan.dependencies[0], context);

      if (isPromiseLike(dependency)) {
        return Promise.resolve(dependency).then(value =>
          this.#initialize(new (target as Type)(value, context)),
        );
      }

      return this.#initialize(new (target as Type)(dependency, context));
    }

    const args = this.#targetArgsFactory(plan, context);

    if (isPromiseLike(args)) {
      return Promise.resolve(args).then(resolved =>
        this.#instantiate(target, storageEntry, resolved, context),
      );
    }

    return this.#instantiate(target, storageEntry, args, context);
  }

  #instantiate<Context extends Record<any, any>> (
    target: TSelector,
    entry: TStorageEntry<TSelector>,
    args: any[],
    context?: Context,
  ): MaybePromise<any> {
    if (!entry.valueFactory) {
      return this.#initialize(new (target as Type)(...args, context));
    }

    const produced = entry.valueFactory([...args], context);
    const finish = (value: any): MaybePromise<any> =>
      this.#initialize(isClassValue(value) ? new value(...args, context) : value);

    return isPromiseLike(produced) ? Promise.resolve(produced).then(finish) : finish(produced);
  }

  #initialize (instance: any): MaybePromise<any> {
    if (typeof instance?.onInitialized === 'function') {
      const initialized = instance.onInitialized();
      if (isPromiseLike(initialized)) {
        return Promise.resolve(initialized).then(() => instance);
      }
    }

    return instance;
  }

  #targetArgsFactory<Context extends Record<any, any> = Record<any, any>> (
    plan: TResolutionPlan,
    context?: Context,
  ): MaybePromise<any[]> {
    const { dependencies } = plan;

    if (dependencies.length === 0) {
      return [];
    }

    const results: any[] = [];
    let asynchronous = false;

    try {
      for (const dependency of dependencies) {
        const value = this.#executePlan(dependency, context);
        results.push(value);
        asynchronous ||= isPromiseLike(value);
      }
    } catch (error) {
      for (const value of results) {
        if (isPromiseLike(value)) {
          void Promise.resolve(value).catch(() => {});
        }
      }
      throw error;
    }

    return asynchronous ? Promise.all(results) : results;
  }

  #initLogger () {
    if (isClassConstructor(this.#options.logger)) {
      this.#logger = new this.#options.logger();
    } else if (typeof this.#options.logger === 'function') {
      this.#logger = this.#options.logger();
    } else {
      this.#logger = this.#options.logger;
    }
  }
}

export * from './errors/constants.js';
export * from './errors/dependency-injection.error.js';
export * from './constants.js';
export * from './types.js';
export * from './utils.js';

/**
 * Logger
 */
export * from './logger/types.js';
export * from './logger/console-logger.impl.js';
