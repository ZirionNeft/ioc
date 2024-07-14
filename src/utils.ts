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
