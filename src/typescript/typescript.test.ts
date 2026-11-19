import { afterEach, describe, expect, it } from 'vitest';
import { copyCompileFixture, evaluateAmd, type FixtureCopy } from '../testing/compileKit.js';

const RIG_TSCONFIG = 'node_modules/test-rig/profiles/default/tsconfig-base.json';

const rigProject = {
  [RIG_TSCONFIG]: {
    compilerOptions: { experimentalDecorators: true, emitDecoratorMetadata: true, target: 'es5', importsNotUsedAsValues: 'remove' },
    include: ['../../../../../src/**/*.ts', '../../../../../src/**/*.tsx'],
  },
  'tsconfig.json': {
    extends: `./${RIG_TSCONFIG}`,
    compilerOptions: { baseUrl: '.', paths: { '@shared/*': ['src/shared/*'] } },
  },
  'src/shared/greeting.ts': "export const greeting: string = 'from the alias';\n",
  'src/shared/types.ts': 'export interface IGreeter {\n  greet(): string;\n}\nexport type Name = string;\n',
  'src/shared/index.ts': "export { IGreeter, Name } from './types';\nexport { greeting } from './greeting';\n",
  'src/shared/levels.ts': "export const enum Level {\n  High = 'high',\n}\n",
};

const decoratedWebPart = `import { greeting, IGreeter } from '@shared/index';
import { Level } from '@shared/levels';
import { IGreeter as IDirectGreeter } from '../../shared/types';

const calls: string[] = [];

function logged(target: object, key: string, descriptor: PropertyDescriptor): PropertyDescriptor {
  calls.push(\`method \${key}\`);
  return descriptor;
}

function parameter(target: object, key: string, index: number): void {
  calls.push(\`parameter \${key} \${index}\`);
}

function field(target: object, key: string): void {
  calls.push(\`field \${key}\`);
}

function tagged<T extends new (...args: any[]) => object>(constructor: T): T {
  return class extends constructor {
    public readonly tagged: boolean = true;
  };
}

class Base {
  public value: string;
  constructor() {
    this.value = 'set by base';
  }
}

class Derived extends Base {
  public value!: string;
}

@tagged
export default class HelloWebPart {
  @field public greeter?: IGreeter;
  public readonly greeting: string = greeting;
  public readonly level: string = Level.High;
  public readonly derivedValue: string = new Derived().value;
  public readonly calls: string[] = calls;

  @logged
  public setGreeter(@parameter greeter: IGreeter): void {
    this.greeter = greeter;
  }

  @logged
  public setDirectGreeter(@parameter greeter: IDirectGreeter): void {
    this.greeter = greeter;
  }
}
`;

const copies: FixtureCopy[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) copy.remove();
});

function fixture(files: Record<string, string | object>): FixtureCopy {
  const copy = copyCompileFixture(files);
  copies.push(copy);
  return copy;
}

describe('TypeScript compile options from tsconfig', () => {
  it('applies rig decorators, class fields, paths through extends, type-only names and const enums like heft', async () => {
    const copy = fixture({ ...rigProject, 'src/webparts/hello/HelloWebPart.ts': decoratedWebPart });
    const metadata: unknown[][] = [];
    const reflect = {
      metadata: (...args: unknown[]) => () => {
        metadata.push(args);
      },
    };

    const { result, messages, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(messages).toEqual([]);
    const WebPart = evaluateAmd(bundle('single-web-part'), undefined, { Reflect: reflect }).exports.default as new () => Record<string, unknown>;
    const webPart = new WebPart();
    expect(webPart).toMatchObject({ tagged: true, greeting: 'from the alias', level: 'high', derivedValue: 'set by base' });
    expect(webPart.calls).toEqual(['field greeter', 'parameter setGreeter 0', 'method setGreeter', 'parameter setDirectGreeter 0', 'method setDirectGreeter']);
    const parameterTypes = metadata.filter(([key]) => key === 'design:paramtypes').map(([, types]) => (types as { name: string }[]).map(({ name }) => name));
    expect(parameterTypes).toEqual([['Object'], ['Object']]);
  }, 60_000);

  it('keeps the warning for a missing name that is not a type', async () => {
    const copy = fixture({
      ...rigProject,
      'src/shared/index.ts': "export { IGreeter } from './types';\nexport { greeting, missingValue } from './greeting';\n",
      'src/webparts/hello/HelloWebPart.ts': decoratedWebPart,
    });

    const { result } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("export 'missingValue' (reexported as 'missingValue') was not found in './greeting'");
  }, 60_000);

  it('defines class fields without an initializer when the target or tsconfig asks for it', async () => {
    const copy = fixture({
      ...rigProject,
      'tsconfig.json': { extends: `./${RIG_TSCONFIG}`, compilerOptions: { target: 'ES2022', baseUrl: '.', paths: { '@shared/*': ['src/shared/*'] } } },
      'src/webparts/hello/HelloWebPart.ts': decoratedWebPart,
    });

    const { result, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    const WebPart = evaluateAmd(bundle('single-web-part'), undefined, { Reflect: { metadata: () => () => undefined } }).exports.default as new () => Record<string, unknown>;
    expect(new WebPart().derivedValue).toBeUndefined();
  }, 60_000);
});

describe('const enums that only exist in declarations', () => {
  it('reports a global declare const enum used as a value', async () => {
    const copy = fixture({
      ...rigProject,
      'src/globals.d.ts': 'declare const enum GlobalSize {\n  Big = 1,\n}\n',
      'src/webparts/hello/HelloWebPart.ts': 'export default class HelloWebPart {\n  public readonly size: number = GlobalSize.Big;\n}\n',
    });

    const { result } = await copy.compile();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/webparts/hello/HelloWebPart.ts uses const enums that are only declared in .d.ts files, so they don't exist in the browser (ReferenceError).");
    expect(result.errors[0]).toContain('GlobalSize: a global `declare const enum` in src/globals.d.ts');
  }, 60_000);

  it('explains an import of a module that only exists as a declaration file', async () => {
    const copy = fixture({
      ...rigProject,
      'src/shared/colors.d.ts': "export declare const enum Color {\n  Red = 'red',\n}\n",
      'src/webparts/hello/HelloWebPart.ts': "import { Color } from '../../shared/colors';\nexport default class HelloWebPart {\n  public readonly color: string = Color.Red;\n}\n",
    });

    const { result } = await copy.compile();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("src/webparts/hello/HelloWebPart.ts imports '../../shared/colors', which only exists as a declaration file: src/shared/colors.d.ts (it declares the const enums Color)");
    expect(result.errors[0]).not.toContain("Can't resolve");
  }, 60_000);
});
