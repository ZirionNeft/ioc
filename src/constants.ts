export enum InjectScope {
  SINGLETON = 'singleton',
  REQUEST = 'request',
  TRANSIENT = 'transient',
}

export const DEFAULT_PROVIDER_OPTIONS = {
  scope: InjectScope.SINGLETON,
};

export const Container = Symbol('Container');
