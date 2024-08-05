import type { Type } from './types.js';

export function isClassConstructor(arg: any): arg is Type {
  if (typeof arg !== 'function') return false;

  // Try to use the class to create an instance, catch any errors.
  try {
    Reflect.construct(String, [], arg);
  } catch (e) {
    return false;
  }
  return true;
}

export function targetName<T>(target: T): string {
  if (!target) {
    return `${typeof target}_target`;
  }
  if (typeof target === 'string') {
    return target;
  }
  if (isClassConstructor(target)) {
    return target.name;
  }
  if (typeof target === 'function') {
    return target.name;
  }

  return target.toString();
}
