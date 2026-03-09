import { DEFAULT_PROVIDER_OPTIONS, InjectScope } from './constants.js';
import { ErrorCode } from './errors/constants.js';
import { DependencyInjectionError } from './errors/dependency-injection.error.js';
import { ConsoleLoggerImpl } from './logger/console-logger.impl.js';
import type { ILogger } from './logger/types.js';
import type {
  IOnFinalized,
  TContainerOptions,
  TSelector,
  TStorageEntry,
  TTargetOptions,
  Type,
} from './types.js';
import { isClassConstructor, targetName } from './utils.js';


export const DEFAULT_OPTIONS: TContainerOptions = {
  logger: ConsoleLoggerImpl,
};

export class Container<Items extends TSelector> {
  readonly #storage = new Map<TSelector, TStorageEntry<Items>>();

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
   * If the `scope` of `provider` is `request`, then a `WeakMap` is also added to the `contextMap` of the `storageEntry`.
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
  add<Selector extends TSelector> (
    target: Selector,
    options: TTargetOptions<Items> = {},
  ): Container<Selector | Items> {
    options = {
      ...DEFAULT_PROVIDER_OPTIONS,
      ...options,
    } as TTargetOptions<Items>;

    if (!target) {
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
      inject: options.inject,
      scope: options.scope,
    } as TStorageEntry<Items>;

    if (storageEntry.scope === InjectScope.REQUEST) {
      storageEntry.contextMap = new WeakMap();
    }

    this.#storage.set(target, storageEntry);

    return this as Container<Selector | Items>;
  }

  /**
   * This method gets an instance of the class or value associated with the provided selector from the container.
   * It throws an error if the selector has not been registered in the container.
   *
   * @template {TSelector} Selector - The type that extends TSelector.
   * @template {Record<any, any>} Context - The type representing the context object provided when the provider is request-scoped.
   * @template {Type} Result - Some value got from container by selector
   *
   * @param {Selector} selector - The class/constructor or value to get from the container.
   * @param {Context} [context] - Optional context if the requested provider is request-scoped.
   *
   * @throws {DependencyInjectionError} - If the target has not been registered in the container.
   *
   * @returns {Promise<Result>} - The instance associated with the selector.
   */
  getOrFail<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
    Result = Selector extends Type<infer A> ? A : any,
  > (selector: Selector, context?: Context): Promise<Result> {
    if (!this.#storage.has(selector)) {
      throw new DependencyInjectionError(
        ErrorCode.UNKNOWN_TARGET,
        `Target with selector '${targetName(selector)}' is not registered`,
      );
    }

    return this.get<Context, Selector, Result>(
      selector,
      context,
    ) as Promise<Result>;
  }

  /**
   * This method gets an instance of the class or value associated with the provided selector from the container.
   * It returns null if the selector has not been registered in the container.
   *
   * @template {TSelector} Selector - The type that extends TSelector.
   * @template {Record<any, any>} Context - The type representing the context object provided when the provider is request-scoped.
   * @template {Type} Result - Some value got from container by selector
   *
   * @param {Selector} selector - The class/constructor or value to get from the container.
   * @param {Context} [context] - Optional context if the requested provider is request-scoped.
   * @returns {Promise<Result | null>} - The instance associated with the selector if it exists, otherwise null.
   */
  async get<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends Items = Items,
    Result = Selector extends Type<infer A> ? A : any,
  > (selector: Selector, context?: Context): Promise<Result | null> {
    const storageEntry = this.#storage.get(selector);

    if (!storageEntry) {
      return null;
    }

    let resultInstance: ThisType<Selector>;

    switch (storageEntry.scope) {
      case InjectScope.SINGLETON: {
        if (!storageEntry.value) {
          const instance = await this.#resolveBasedOnKeyKind(
            selector,
            storageEntry,
          );

          storageEntry.value = instance;
        }

        resultInstance = storageEntry.value;

        break;
      }

      case InjectScope.REQUEST: {
        if (!context || typeof context !== 'object') {
          throw new DependencyInjectionError(
            ErrorCode.REQUEST_SCOPE_CONTEXT_REQUIRED,
            `Target '${targetName(selector)}' is request-scoped and must have context object as second argument in get() call`,
            selector,
          );
        }

        const requestStorageEntry = storageEntry as TStorageEntry<
          Items,
          any,
          InjectScope.REQUEST
        >;

        if (!requestStorageEntry.contextMap.has(context)) {
          const instance = await this.#resolveBasedOnKeyKind(
            selector,
            storageEntry,
            context,
          );

          requestStorageEntry.contextMap.set(context, instance);
        }

        resultInstance = requestStorageEntry.contextMap.get(context);
        break;
      }

      default:
        throw new DependencyInjectionError(
          ErrorCode.UNKNOWN_SCOPE,
          `Unknown scope '${storageEntry.scope}' of target '${targetName(selector)}'`,
          selector,
        );
    }

    return resultInstance as Result;
  }

  /**
   * Run this method after all dependencies registered in the container
   * @return {Promise<void>}
   */
  async finalize (): Promise<Container<Items>> {
    for (const target of this.#storage.keys()) {
      if (
        typeof target === 'object' &&
        typeof (target as Record<any, any>).onFinalized === 'function'
      ) {
        await (target as IOnFinalized).onFinalized();
        continue;
      }

      if (
        isClassConstructor(target) &&
        typeof (target as Record<any, any>)?.prototype?.onFinalized ===
          'function'
      ) {
        const instance: IOnFinalized | null = await this.get(target as Items);
        await instance?.onFinalized();
      }
    }

    return this;
  }

  /**
   * Alias for `finalize()`
   * @return {Promise<void>}
   */
  async build (): Promise<Container<Items>> {
    return this.finalize();
  }

  async #resolveBasedOnKeyKind<Context extends Record<any, any> = any> (
    target: TSelector,
    storageEntry: TStorageEntry<Items>,
    context?: Context,
  ): Promise<any> {
    let instance: any;

    if (!storageEntry.valueFactory) {
      if (isClassConstructor(target)) {
        const targetArgs = await this.#targetArgsFactory(
          [target, storageEntry],
          context,
        );

        instance = new target(...targetArgs, context);
      } else {
        throw new DependencyInjectionError(
          ErrorCode.TARGET_TYPE_BAD_RESOLVER,
          `Target '${targetName(target)}' must have an constructor function either have value field in initial options`,
          target,
        );
      }
    } else if (typeof storageEntry.valueFactory === 'function') {
      const targetArgs = await this.#targetArgsFactory(
        [target, storageEntry],
        context,
      );

      const instanceOrClass = await storageEntry.valueFactory(
        [...targetArgs],
        context,
      );

      if (isClassConstructor(instanceOrClass)) {
        instance = new instanceOrClass(...targetArgs, context);
      } else {
        instance = instanceOrClass;
      }
    } else {
      throw new DependencyInjectionError(
        ErrorCode.TARGET_TYPE_BAD_RESOLVER,
        `Target '${targetName(target)}' must have 'valueFactory' or be a class constructor`,
        target,
      );
    }

    if (typeof instance?.onInitialized === 'function') {
      instance.onInitialized();
    }

    return instance;
  }

  async #targetArgsFactory<Context extends Record<any, any> = Record<any, any>> (
    [target, targetOpts]: [TSelector, TTargetOptions<any>],
    context?: Context,
  ): Promise<Set<any>> {
    const targetCtorArgs = new Set<any>([]);

    if (targetOpts.inject?.length) {
      for (const dependencyTarget of targetOpts.inject) {
        const dependencyInstanceData = this.#storage.get(dependencyTarget);

        if (!dependencyInstanceData) {
          throw new DependencyInjectionError(
            ErrorCode.UNKNOWN_TARGET,
            `Unknown instance provider '${targetName(dependencyTarget)}' ` +
            `when resolving target '${targetName(target)}'. Make sure that in container dependency is registered earlier than the target.`,
          );
        }

        if (
          targetOpts.scope === InjectScope.SINGLETON &&
          dependencyInstanceData.scope === InjectScope.REQUEST
        ) {
          throw new DependencyInjectionError(
            ErrorCode.SINGLETONE_SCOPE_WRONG_CONTEXT,
            `Provider '${targetName(target)}' is singleton and can't have request-scoped dependencies '${targetName(dependencyTarget)}'`,
          );
        }

        const dependencyInstance = await this.get(
          dependencyTarget as Items,
          context,
        );

        targetCtorArgs.add(dependencyInstance);
      }
    }

    return targetCtorArgs;
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
