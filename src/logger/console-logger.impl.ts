import type { ILogFunction, ILogger } from './types.js';

export class ConsoleLoggerImpl implements ILogger<ILogFunction, Console> {
  readonly #provider: Console;

  constructor() {
    this.#provider = console;
  }

  getProvider<T extends Console = Console>(): T {
    return this.#provider as T;
  }

  error(objOrMsg: any, ...args: unknown[]): void {
    console.error(objOrMsg, ...args);
  }

  warn(objOrMsg: any, ...args: unknown[]): void {
    console.warn(objOrMsg, ...args);
  }

  info(objOrMsg: any, ...args: unknown[]): void {
    console.info(objOrMsg, ...args);
  }

  debug(objOrMsg: any, ...args: unknown[]): void {
    console.debug(objOrMsg, ...args);
  }

  trace(objOrMsg: any, ...args: unknown[]): void {
    console.trace(objOrMsg, ...args);
  }
}
