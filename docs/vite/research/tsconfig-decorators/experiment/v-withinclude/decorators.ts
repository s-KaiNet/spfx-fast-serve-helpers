export const log: string[] = [];

export function tagged(tag: string) {
  return function <T extends new (...args: any[]) => object>(ctor: T): T {
    return class extends ctor {
      public tag = tag;
    };
  };
}

export function traced(target: object, key: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  const original = descriptor.value;
  descriptor.value = function (this: unknown, ...args: unknown[]) {
    log.push(`call:${key}`);
    return original.apply(this, args);
  };
  return descriptor;
}

export function observed(target: object, key: string): void {
  let store: unknown;
  log.push(`prop:${key}`);
  Object.defineProperty(target, key, {
    get: () => store,
    set: (value: unknown) => {
      log.push(`set:${key}=${String(value)}`);
      store = value;
    },
    configurable: true,
  });
}

export function inject(token: string) {
  return function (target: object, key: string | symbol | undefined, index: number): void {
    log.push(`param:${String(key)}:${index}:${token}`);
  };
}
