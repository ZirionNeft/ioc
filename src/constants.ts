export enum InjectScope {
  SINGLETON = 'singleton',
  REQUEST = 'request',
}

export const DEFAULT_PROVIDER_OPTIONS = {
  scope: InjectScope.SINGLETON,
};

export const Container = Symbol('Container');
