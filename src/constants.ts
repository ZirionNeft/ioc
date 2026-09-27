export enum InjectScope {
  SINGLETON = 'singleton',
  REQUEST = 'request',
  TRANSIENT = 'transient',
}

export const DEFAULT_PROVIDER_OPTIONS = {
  scope: InjectScope.TRANSIENT,
};

export const Container = Symbol('Container');
