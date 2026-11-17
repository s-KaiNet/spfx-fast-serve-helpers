import type { IFoo } from './foo';

declare global {
  const enum AugmentedLevel {
    Low = 1,
  }
  interface Window {
    foo: IFoo;
  }
}

declare const enum ModuleScoped {
  A = 1,
}
