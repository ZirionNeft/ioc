import { Container } from '#base/index';
import { ConsoleLoggerImpl } from '#base/logger/console-logger.impl';
import type { ILogger } from '#base/logger/types';
import { beforeEach, describe, expect, it, type Mock, vi } from 'vitest';

describe('logger', () => {
  class CustomLogger implements ILogger {
    error() {}

    warn() {}
    info() {}
    debug() {}
    trace() {}
  }
  CustomLogger.prototype.error = vi.fn();
  CustomLogger.prototype.warn = vi.fn();
  CustomLogger.prototype.info = vi.fn();
  CustomLogger.prototype.debug = vi.fn();
  CustomLogger.prototype.trace = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use default logger if none is provided', async () => {
    const container = new Container();

    expect(container.logger.getProvider?.<ConsoleLoggerImpl>()).toEqual(
      console,
    );
    expect(container.logger).toBeInstanceOf(ConsoleLoggerImpl);
  });

  describe('custom logger', () => {
    it('as a class constructor', () => {
      const container = new Container({ logger: CustomLogger });

      expect(container.logger).toBeInstanceOf(CustomLogger);
    });

    it('as a function', () => {
      const container = new Container({ logger: () => new CustomLogger() });

      expect(container.logger).toBeInstanceOf(CustomLogger);
    });

    it('as instance', () => {
      const logger = new CustomLogger();
      const container = new Container({ logger });

      expect(container.logger).toBeInstanceOf(CustomLogger);
    });

    it('as interface', () => {
      const container = new Container({
        logger: {
          error: () => vi.fn(),
          warn: () => vi.fn(),
          info: () => vi.fn(),
          debug: () => vi.fn(),
          trace: () => vi.fn(),
        },
      });

      expect(
        ['error', 'warn', 'info', 'debug', 'trace'].every(
          (key) => typeof (container.logger as any)[key] === 'function',
        ),
      );
    });
  });

  it('methods should be called', async () => {
    const container = new Container({ logger: CustomLogger });

    container.logger.error('test_error');
    container.logger.warn('test_warn');
    container.logger.info('test_info');
    container.logger.debug('test_debug');
    container.logger.trace('test_trace');

    for (const key of ['error', 'warn', 'info', 'debug', 'trace']) {
      expect((container.logger as any)[key] as Mock<any>).toHaveBeenCalledWith(
        `test_${key}`,
      );
      expect(
        (container.logger as any)[key] as Mock<any>,
      ).toHaveBeenCalledOnce();
    }
  });
});
