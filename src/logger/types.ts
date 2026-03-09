export interface ILogFunction {
  <T extends object>(obj: T, msg?: string, ...args: any[]): void;
  (obj: unknown, msg?: string, ...args: any[]): void;
  (msg: string, ...args: any[]): void;
}

export interface ILogger<F = ILogFunction, P = any> {
  error: F;
  warn: F;
  info: F;
  debug: F;
  trace: F;

  getProvider?<T extends P = P>(): T;
}
