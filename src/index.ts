import { InjectScope } from './constants.js';
import type { IOnFinalized, TSelector, ITargetOptions, IStorageEntry } from './types.js';
import { isClassConstructor } from './utils.js';

export const DEFAULT_PROVIDER_OPTIONS = {
  scope: InjectScope.SINGLETON,
};

export class Container {
  readonly #storage = new Map<TSelector, IStorageEntry>();

  add<Selector extends TSelector>(target: Selector, options: ITargetOptions<Selector> = {}): this {
    options = {
      ...DEFAULT_PROVIDER_OPTIONS,
      ...options,
    } as ITargetOptions<Selector>;

    if (!target) {
      throw new Error('Provider target is null or undefined');
    }

    if (this.#storage.has(target)) {
      throw new Error(
        `Provider with name '${target.toString()}' already registered`,
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

  getOrFail<
    T = any,
    Context extends Record<any, any> = Record<any, any>,
    Selector extends TSelector = TSelector,
    Result = T extends Record<any, any> ? T : ThisType<Selector>,
  >(target: Selector, context?: Context): Result {
    if (!this.#storage.has(target)) {
      throw new Error(`Unknown target name '${target.toString()}'`);
    }

    return this.get<T, Context, Selector, Result>(target, context)!;
  }

  get<
    T = any,
    Context extends Record<any, any> = Record<any, any>,
    Selector extends TSelector = TSelector,
    Result = T extends Record<any, any> ? T : ThisType<Selector>,
  >(target: Selector, context?: Context): Result | null {
    const storageEntry = this.#storage.get(target);

    if (!storageEntry) {
      return null;
    }

    let resultInstance: ThisType<Selector>;

    switch (storageEntry.scope) {
      case InjectScope.SINGLETON: {
        const instance = this.#resolveBasedOnKeyKind(
          target,
          storageEntry,
          context,
        );

        resultInstance = instance;

        break;
      }

      case InjectScope.REQUEST: {
        if (!context || typeof context !== 'object') {
          throw new Error(
            `Provider '${target.toString()}' is request-scoped and must have context object as second argument in get() call`,
          );
        }

        const requestStorageEntry =
          storageEntry as IStorageEntry<InjectScope.REQUEST>;

        if (!requestStorageEntry.contextMap.has(context)) {
          const instance = this.#resolveBasedOnKeyKind(
            target,
            storageEntry,
            context,
          );

          requestStorageEntry.contextMap.set(context, instance);
        }

        resultInstance = requestStorageEntry.contextMap.get(context);
        break;
      }

      default:
        throw new Error(
          `Unknown scope '${storageEntry.scope}' of provider '${target.toString()}'`,
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
        typeof target.prototype['onFinalize'] === 'function'
      ) {
        const instance = this.getOrFail<IOnFinalized>(target);
        await instance.onFinalized();
      }
    }
  }

  #resolveBasedOnKeyKind<Selector extends TSelector, Context extends Record<any, any>>(
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
        throw new Error(
          `Target '${target.toString()}' must have an constructor function or have value field in initial options`,
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
    [key, targetOpts]: [TSelector, ITargetOptions<any>],
    context?: Context,
  ): Set<any> {
    const targetCtorArgs = new Set<any>([]);

    if (targetOpts.inject?.length) {
      for (const dep of targetOpts.inject) {
        if (isClassConstructor(dep)) {
          const dependencyInstanceData = this.#storage.get(dep);

          if (!dependencyInstanceData) {
            throw new Error(`Unknown instance provider '${dep.name}'`);
          }

          if (
            targetOpts.scope === InjectScope.SINGLETON &&
            dependencyInstanceData.scope === InjectScope.REQUEST
          ) {
            throw new Error(
              `Provider '${key.toString()}' is singleton and can't have request-scoped dependencies: ${dep.name}`,
            );
          }
        }

        const dependencyInstance = this.get(dep, context);

        targetCtorArgs.add(dependencyInstance);
      }
    }

    return targetCtorArgs;
  }
}

export * from './constants.js';
export * from './types.js'
export * from './utils.js'
