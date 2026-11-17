import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { exportedConstEnums, globalConstEnums, referencedGlobals } from './declarations.js';
import { constEnumGuardPlugin, findDeclarationOnlyModule } from './index.js';

const root = fileURLToPath(new URL('../../../test/fixtures/ts-only-names/', import.meta.url)).replace(/[\\/]$/, '');

describe('globalConstEnums', () => {
  it('reads const enums of global declaration files and of declare global blocks only', () => {
    expect(globalConstEnums('declare const enum GlobalLevel { Low = 10 }\n/* const enum Commented {} */\nconst enum Plain { A }')).toEqual(['GlobalLevel', 'Plain']);
    expect(globalConstEnums("import type { X } from './x';\ndeclare global {\n  const enum Augmented { A = 1 }\n  interface Window { x: X }\n}\ndeclare const enum ModuleScoped { A }")).toEqual(['Augmented']);
    expect(globalConstEnums('export declare const enum DtsEnum { X = 7 }')).toEqual([]);
  });
});

describe('exportedConstEnums', () => {
  it('lists the exported const enums of a declaration module', () => {
    expect(exportedConstEnums('export declare const enum DtsEnum { X = 7 }\nexport const enum Other { A }\nexport interface I {}')).toEqual(['DtsEnum', 'Other']);
  });
});

describe('referencedGlobals', () => {
  it('finds value uses of names the module does not declare or import', () => {
    expect(referencedGlobals('export const a = { high: GlobalLevel.High, b: Other["B"] };', ['GlobalLevel', 'Other', 'Unused'])).toEqual(['GlobalLevel', 'Other']);
    expect(referencedGlobals('import { GlobalLevel } from "./levels";\nexport const a = GlobalLevel.High;', ['GlobalLevel'])).toEqual([]);
    expect(referencedGlobals('var GlobalLevel = {};\nexport const a = GlobalLevel.High;', ['GlobalLevel'])).toEqual([]);
    expect(referencedGlobals('export const a = props.GlobalLevel.High + MyGlobalLevel.x;', ['GlobalLevel'])).toEqual([]);
  });
});

describe('findDeclarationOnlyModule', () => {
  it('finds a .d.ts that stands in for a module without JavaScript', () => {
    expect(findDeclarationOnlyModule(path.join(root, 'src/enums/moduleTypes'))).toBe(path.join(root, 'src/enums/moduleTypes.d.ts'));
    expect(findDeclarationOnlyModule(path.join(root, 'src/enums/moduleTypes.js'))).toBe(path.join(root, 'src/enums/moduleTypes.d.ts'));
    expect(findDeclarationOnlyModule(path.join(root, 'src/enums/colors'))).toBeUndefined();
  });
});

describe('constEnumGuardPlugin in Vite', () => {
  let server: ViteDevServer;
  const errors: string[] = [];
  const addedDeclaration = path.join(root, 'src/global/added.d.ts');

  beforeAll(async () => {
    const logger = { info: () => undefined, warn: () => undefined, error: (message: string) => errors.push(message) };
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false, watch: null },
      plugins: [constEnumGuardPlugin({ root, logger })],
    });
  });

  afterAll(async () => {
    await server.close();
  });

  afterEach(() => {
    errors.length = 0;
    rmSync(addedDeclaration, { force: true });
  });

  it('names an ambient const enum used as a value and logs it in the browser console', async () => {
    const result = await server.environments.client.transformRequest('/src/enums/useAmbient.ts');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("src/enums/useAmbient.ts uses const enums that are only declared in .d.ts files, so they don't exist in the browser (ReferenceError).");
    expect(errors[0]).toContain('  GlobalLevel: a global `declare const enum` in src/enums/ambient.d.ts');
    expect(errors[0]).toContain('regular `enum`');
    expect(result?.code.startsWith(`console.error(${JSON.stringify(`[fast-serve] ${errors[0]}`)});`)).toBe(true);
  });

  it('finds const enums declared in declare global blocks', async () => {
    await server.environments.client.transformRequest('/src/global/useAugmented.ts');
    expect(errors[0]).toContain('AugmentedLevel: a global `declare const enum` in src/global/augment.d.ts');
  });

  it('accepts imported enums with the same name and const enums from .ts files', async () => {
    const client = server.environments.client;
    const results = await Promise.all(['/src/global/shadowed.ts', '/src/enums/useDirect.ts', '/src/enums/local.ts'].map((url) => client.transformRequest(url)));
    for (const result of results) expect(result?.code).not.toContain('console.error');
    expect(errors).toEqual([]);
  });

  it('picks up declaration files added while serving', async () => {
    writeFileSync(addedDeclaration, 'declare const enum AddedLater { A = 1 }\n');
    server.watcher.emit('add', addedDeclaration);
    writeFileSync(path.join(root, 'src/global/useAdded.ts'), 'export const added = AddedLater.A;\n');
    try {
      await server.environments.client.transformRequest('/src/global/useAdded.ts');
      expect(errors[0]).toContain('AddedLater: a global `declare const enum` in src/global/added.d.ts');
    } finally {
      rmSync(path.join(root, 'src/global/useAdded.ts'), { force: true });
    }
  });

  it('explains an import of a module that only has a .d.ts instead of "Failed to resolve import"', async () => {
    const failure = await server.environments.client.transformRequest('/src/enums/useDts.ts').then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(message).toContain("src/enums/useDts.ts imports './moduleTypes', which only exists as a declaration file: src/enums/moduleTypes.d.ts (it declares the const enums DtsEnum)");
    expect(message).toContain('`import type`');
    expect(message).not.toContain('Failed to resolve import');
  });
});
