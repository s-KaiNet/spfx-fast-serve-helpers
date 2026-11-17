import { inject, log, observed, tagged, traced } from './decorators';

@tagged('T1')
export class Tagged {
  public name = 'tagged';
}

export class Calculator {
  @traced
  public add(a: number, b: number): number {
    return a + b;
  }
}

export class Model {
  @observed
  public title: string = 'initial';

  @observed
  public untouched: string;
}

export class Service {
  constructor(@inject('http') public http: string, @inject('cfg') cfg?: string) {}

  public run(@inject('arg') value: string): string {
    return value;
  }
}

class Base {
  public declared: string;
  public label!: string;
  constructor() {
    this.init();
  }
  protected init(): void {
    this.declared = 'from-base';
    this.label = 'from-base';
  }
}

export class Derived extends Base {
  public declared: string;
  public label!: string;
  public value = 'v';
}

export function runAll(): Record<string, unknown> {
  const tagged = new Tagged() as Tagged & { tag?: string };
  const calc = new Calculator();
  const sum = calc.add(2, 3);
  const model = new Model();
  model.title = 'changed';
  const service = new Service('h');
  service.run('x');
  const derived = new Derived();
  return {
    tag: tagged.tag,
    sum,
    titleOwn: Object.prototype.hasOwnProperty.call(model, 'title'),
    untouchedOwn: Object.prototype.hasOwnProperty.call(model, 'untouched'),
    derivedDeclared: derived.declared,
    derivedLabel: derived.label,
    log: [...log],
  };
}
