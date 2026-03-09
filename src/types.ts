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
  context?: Scope extends InjectScope.REQUEST ? Context | undefined : never,
) => MaybePromise<any>;

export type TTargetOptions<
  Dependencies extends TSelector = TSelector,
  Scope extends InjectScope = InjectScope,
  Context extends Record<any, any> = Scope extends InjectScope.REQUEST
    ? Record<any, any>
    : never,
> = {
  /**
   * The factory function to produce the value for the provider.
   */
  valueFactory?: TValueFactory<Scope, Context>;
  /**
   * A list of dependencies to be injected into this provider.
   */
  inject?: Dependencies[];
  /**
   * The scope of the provider, defining its lifecycle and behavior.
   */
  scope?: Scope;
};

export type TStorageEntry<
  Dependencies extends TSelector = TSelector,
  Value = any,
  Scope extends InjectScope = InjectScope,
  Context extends Record<any, any> = Scope extends InjectScope.REQUEST
    ? Record<any, any>
    : never,
> = {
  contextMap: Scope extends InjectScope.REQUEST ? WeakMap<Context, any> : never;
  value?: Value | null;
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
 * is built.
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
   * Called during the initialization process of the class or component.
   */
  onInitialized(): MaybePromise<void>;
}
