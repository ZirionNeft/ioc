import type { ErrorCode } from './constants.js';

/**
 * The `DependencyInjectionError` class represents an error thrown when
 * there are issues with the Dependency Injection process. This class extends
 * from the built-in Error class and provides custom error functionality.
 *
 * @example
 * // Usage example:
 * throw new DependencyInjectionError('An error occurred during the dependency injection!')
 *
 * @param code - An ErrorCode enums member, indicating the specific type of dependency injection error.
 * @param message - A string that describes the error details. The default value is 'Dependency Injection error'.
 * @param target - (Optional) The target object that the error arised from.
 * @param dependency - (Optional) The specific dependency that caused the error.
 */
export class DependencyInjectionError extends Error {
  readonly code: ErrorCode;

  readonly target?: any;
  readonly dependency?: any;

  /**
   * Constructs a new `DependencyInjectionError`.
   *
   * @param {ErrorCode} code - An ErrorCode enums member, indicating the nature of the error.
   * @param {string} message - A string describing the error details. Defaults to 'Dependency Injection error'.
   * @param {any} [target] - An optional parameter indicating the target object the cause the error occurred.
   * @param {any} [dependency] - An optional parameter indicating the specific dependency involved the target when the error occurred.
   */
  constructor(
    code: ErrorCode,
    message: string = 'Dependency Injection error',
    target?: any,
    dependency?: any,
  ) {
    super(message);

    this.code = code;
    this.target = target;
    this.dependency = dependency;
  }

  /**
   * Checks whether the error code of this `DependencyInjectionError` instance matches the given error code.
   *
   * @param {ErrorCode} code - The error code to check against.
   * @returns {boolean} Returns true if the error code matches, otherwise false.
   */
  hasCode(code: ErrorCode): boolean {
    return this.code === code;
  }
}
