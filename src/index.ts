import { ErrorCode } from './errors/constants.js';
import { DependencyInjectionError } from './errors/dependency-injection.error.js';
import { DEFAULT_PROVIDER_OPTIONS, InjectScope } from './constants.js';
import type {
  IOnFinalized,
  TSelector,
  ITargetOptions,
  IStorageEntry, Type,
} from './types.js';
import { isClassConstructor, targetName } from './utils.js';

export class Container {
  readonly #storage = new Map<TSelector, IStorageEntry>();

  /**
   * Adds a new provider to the container storage.
   * The provider is identified by `target`, and has the specific `options` configured.
   *
   * The method throws an error if the `target` is not provided or if the `target` already exists in the storage.
   *
   * If the `scope` of `provider` is `request` then a `WeakMap` is also added to the `contextMap` of the `storageEntry`.
   *
   * @template Selector - The type that extends TSelector.
   *
   * @param {Selector} target - The identifier used for the provider.
   * @param {ITargetOptions<Selector>} [options={}] - Additional configuration for the provider.
   *
   * @throws {DependencyInjectionError} - If `target` is not provided or already exists in the container.
   *
   * @returns {Container} - The container instance for method chaining.
   */
  add<Selector extends TSelector>(
    target: Selector,
    options: ITargetOptions<Selector> = {},
  ): this {
    options = {
      ...DEFAULT_PROVIDER_OPTIONS,
      ...options,
    } as ITargetOptions<Selector>;

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
      value: options.value ?? null,
      inject: options.inject,
      scope: options.scope,
    } as IStorageEntry<Selector>;

    if (storageEntry.scope === 'request') {
      (storageEntry as IStorageEntry<InjectScope.REQUEST>).contextMap =
        new WeakMap();
    }

    this.#storage.set(target, storageEntry);

    return this;
  }

  /**
   * This method gets an instance of the class or value associated with the provided selector from the container.
   * It throws an error if the selector has not been registered in the container.
   *
   * @template {TSelector} Selector - The type that extends TSelector.
   * @template {Record<any, any>} Context - The type representing the context object provided when the provider is request-scoped.
   * @template {Type} Result - Some value got from container by selector
   * 
   * @param {Selector} target - The class/constructor or value to get from the container.
   * @param {Context} [context] - Optional context if the requested provider is request-scoped.
   *
   * @throws {DependencyInjectionError} - If the target has not been registered in the container.
   *
   * @returns {Result} - The instance associated with the selector if it exists, otherwise null.
   */
  getOrFail<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends TSelector = TSelector,
    Result = Selector extends Type<infer A> ? A : unknown,
  >(target: Selector, context?: Context): Result {
    if (!this.#storage.has(target)) {
      throw new DependencyInjectionError(
        ErrorCode.UNKNOWN_TARGET,
        `Target with selector '${targetName(target)}' is not registered`,
      );
    }

    return this.get<Context, Selector, Result>(target, context)!;
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
   * @returns {Result | null} - The instance associated with the selector if it exists, otherwise null.
   */
  get<
    Context extends Record<any, any> = Record<any, any>,
    Selector extends TSelector = TSelector,
    Result = Selector extends Type<infer A> ? A : unknown,
  >(selector: Selector, context?: Context): Result | null {
    const storageEntry = this.#storage.get(selector);

    if (!storageEntry) {
      return null;
    }

    let resultInstance: ThisType<Selector>;

    switch (storageEntry.scope) {
      case InjectScope.SINGLETON: {
        const instance = this.#resolveBasedOnKeyKind(selector, storageEntry);

        storageEntry.value ??= instance;

        resultInstance = instance;

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

        const requestStorageEntry =
          storageEntry as IStorageEntry<InjectScope.REQUEST>;

        if (!requestStorageEntry.contextMap.has(context)) {
          const instance = this.#resolveBasedOnKeyKind(
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
   * Run this method after registering of all dependencies into container
   * @return {Promise<void>}
   */
  async finalize(): Promise<void> {
    for (const target of this.#storage.keys()) {
      if (
        isClassConstructor(target) &&
        typeof target.prototype['onFinalized'] === 'function'
      ) {
        const instance = this.getOrFail<IOnFinalized>(target);
        await instance.onFinalized();
      }
    }
  }

  #resolveBasedOnKeyKind<
    Selector extends TSelector,
    Context extends Record<any, any>,
  >(
    target: Selector,
    storageEntry: IStorageEntry,
    context?: Context,
  ): ThisType<Selector> {
    let instance: ThisType<Selector>;

    if (!storageEntry.value) {
      if (isClassConstructor(target)) {
        const targetArgs = this.#targetArgsFactory(
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
    } else if (typeof storageEntry.value === 'function') {
      const targetArgs = this.#targetArgsFactory(
        [target, storageEntry],
        context,
      );

      instance = storageEntry.value(...targetArgs, context);
    } else {
      instance = storageEntry.value;
    }

    return instance;
  }

  #targetArgsFactory<Context extends Record<any, any> = Record<any, any>>(
    [target, targetOpts]: [TSelector, ITargetOptions<any>],
    context?: Context,
  ): Set<any> {
    const targetCtorArgs = new Set<any>([]);

    if (targetOpts.inject?.length) {
      for (const dependencyTarget of targetOpts.inject) {
        const dependencyInstanceData = this.#storage.get(dependencyTarget);

        if (!dependencyInstanceData) {
          throw new DependencyInjectionError(
            ErrorCode.UNKNOWN_TARGET,
            `Unknown instance provider '${targetName(dependencyTarget)}' when resolving target '${targetName(target)}'. Make sure that in container dependency is registered earlier than the target.`,
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

        const dependencyInstance = this.get(dependencyTarget, context);

        targetCtorArgs.add(dependencyInstance);
      }
    }

    return targetCtorArgs;
  }
}

export * from './errors/constants.js';
export * from './errors/dependency-injection.error.js';
export * from './constants.js';
export * from './types.js';
export * from './utils.js';
