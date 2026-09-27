import type { InjectScope } from './constants.js';
import type { ILogger } from './logger/types.js';


export type Type<T = any> = new (...args: any[]) => T;

export type MaybePromise<T> = T | Promise<T>;


export type TSelector = Type | string | symbol | object;

export type TValueFactory<
  Scope extends InjectScope,
  Context,
  Dependencies extends any[] = any[],
> = (
  dependencies: Dependencies,
  context?: Scope extends InjectScope.SINGLETON ? never : Context | undefined,
) => MaybePromise<any>;

export type TTargetOptions<
  Dependencies extends TSelector = TSelector,
  Scope extends InjectScope = InjectScope,
  Context extends Record<any, any> = Scope extends InjectScope.SINGLETON
    ? never
    : Record<any, any>,
> = {
  /**
   * Creates a value from the resolved dependencies. It may be asynchronous.
   * A returned class is instantiated; a returned ordinary function is kept as a value.
   */
  valueFactory?: TValueFactory<Scope, Context>;
  /**
   * Selectors to inject in argument order. Repeated selectors are preserved.
   */
  inject?: Dependencies[];
  /**
   * The provider lifetime. Defaults to singleton when omitted. Transient
   * providers create a new value on each resolution.
   */
  scope?: Scope;
};

export type TStorageEntry<
  Dependencies extends TSelector = TSelector,
  Value = any,
  Scope extends InjectScope = InjectScope,
  Context extends Record<any, any> = Scope extends InjectScope.SINGLETON
    ? never
    : Record<any, any>,
> = {
  contextMap: Scope extends InjectScope.REQUEST ? WeakMap<Context, Promise<Value>> : never;
  valuePromise?: Promise<Value>;
} & TTargetOptions<Dependencies, Scope, Context>;

export type TContainerOptions = {
  /**
   * Provides a logger instance to be used within the container.
   * Defaults to a simple console-based logger if none is provided.
   *
   * @Type ILogger
   * @default ConsoleLoggerImpl
   */
  logger: ILogger | Type<ILogger> | (() => ILogger);
};

/**
 * Represents a lifecycle hook that invokes logic when the container
 * is built. Request-scoped and transient classes are not instantiated during
 * finalization, so this hook is not called for them.
 */
export interface IOnFinalized {
  /**
   * Called during the container build process for the specific target.
   */
  onFinalized(): MaybePromise<void>;
}

/**
 * Represents a lifecycle hook that invokes logic when the implementing class or component
 * is being initialized.
 */
export interface IOnInitialized {
  /**
   * Called when an instance is created. Async hooks finish before get() returns;
   * a rejected hook causes resolution to fail and allows a later retry.
   */
  onInitialized(): MaybePromise<void>;
}
