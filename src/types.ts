import type { InjectScope } from './constants.js';

export type Type<T = any> = new (...args: any[]) => T;

export type MaybePromise<T> = T | Promise<T>;

export type TStorageValue<T, C> =
  | ((context?: C, ...args: any[]) => MaybePromise<ThisType<T>>)
  | ThisType<T>
  | null;

export type TSelector = Type | string | symbol;

export interface ITargetOptions<
  T extends TSelector,
  S extends InjectScope = InjectScope,
  C extends Record<any, any> = S extends InjectScope.REQUEST
    ? Record<any, any>
    : never,
> {
  value?: TStorageValue<T, C>;
  inject?: TSelector[];
  scope?: S;
}

export interface IStorageEntry<
  T extends TSelector = any,
  S extends InjectScope = InjectScope,
  C extends Record<any, any> = S extends InjectScope.REQUEST
    ? Record<any, any>
    : never,
> extends ITargetOptions<T, S, C> {
  contextMap: S extends InjectScope.REQUEST ? WeakMap<C, any> : never;
}

export interface IOnFinalized {
  onFinalized(): MaybePromise<void>;
}
