import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import type { LocalizedResource } from '../project/index.js';
import { localizationPlugin } from './index.js';
import { evaluateLocFile, readLocFile, renderLocModule } from './locModule.js';

const STRINGS_INTERFACE = 'interface IStrings { Title: string; Count: string }';

describe('evaluateLocFile', () => {
  it('reads AMD loc files with a factory or an object', () => {
    expect(evaluateLocFile('define([], function () { return { A: "a" }; });', 'x.js')).toEqual({ strings: { A: 'a' }, format: 'amd' });
    expect(evaluateLocFile('define({ B: "b" });', 'x.js')).toEqual({ strings: { B: 'b' }, format: 'amd' });
  });

  it('reads CommonJS loc files', () => {
    expect(evaluateLocFile('module.exports = { C: "c" };', 'x.js')).toEqual({ strings: { C: 'c' }, format: 'module' });
  });

  it('fails clearly when nothing is defined', () => {
    expect(() => evaluateLocFile('var x = 1;', 'loc/en-us.js')).toThrow('loc/en-us.js did not define a strings object');
  });
});

describe('readLocFile', () => {
  let dir: string;
  const write = (name: string, code: string) => {
    const file = path.join(dir, name);
    writeFileSync(file, code);
    return file;
  };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fast-serve-loc-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads TypeScript loc files with export default', async () => {
    const file = write('en-us.ts', `${STRINGS_INTERFACE}\nconst strings: IStrings = { Title: 'Hi', Count: '2' };\nexport default strings;\n`);
    expect(await readLocFile(file)).toEqual({ strings: { Title: 'Hi', Count: '2' }, format: 'module', files: [file] });
  });

  it('reads TypeScript loc files with export =', async () => {
    const file = write('en-us.ts', `${STRINGS_INTERFACE}\nconst strings: IStrings = { Title: 'Hi', Count: '2' };\nexport = strings;\n`);
    expect(await readLocFile(file)).toMatchObject({ strings: { Title: 'Hi', Count: '2' }, format: 'module' });
  });

  it('reads TypeScript loc files written as typed AMD modules', async () => {
    const file = write(
      'en-us.ts',
      `${STRINGS_INTERFACE}\ndeclare const define: (deps: string[], factory: () => IStrings) => void;\n` +
        "define([], function (): IStrings {\n  return { Title: 'Hi', Count: '2' };\n});\n",
    );
    expect(await readLocFile(file)).toMatchObject({ strings: { Title: 'Hi', Count: '2' }, format: 'amd' });
  });

  it('follows imports of TypeScript loc files and reports them as watched files', async () => {
    const shared = write('shared.ts', "export const common = { Title: 'Shared' };\n");
    const file = write('en-us.ts', "import { common } from './shared';\nexport default { ...common, Count: '2' };\n");
    const locFile = await readLocFile(file);
    expect(locFile.strings).toEqual({ Title: 'Shared', Count: '2' });
    expect(locFile.files.toSorted()).toEqual([file, shared].toSorted());
  });

  it('falls back to bundling JavaScript loc files that are ES modules', async () => {
    const file = write('en-us.js', "export default { Title: 'Hi' };\n");
    expect(await readLocFile(file)).toEqual({ strings: { Title: 'Hi' }, format: 'module', files: [file] });
  });

  it('evaluates AMD JavaScript loc files directly', async () => {
    const file = write('en-us.js', 'define([], function () { return { Title: "Hi" }; });');
    expect(await readLocFile(file)).toEqual({ strings: { Title: 'Hi' }, format: 'amd', files: [file] });
  });
});

describe('localizationPlugin', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'fast-serve-loc-plugin-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function loadStrings(resource: LocalizedResource) {
    const warnings: string[] = [];
    const watched: string[] = [];
    const context = {
      root: dir,
      options: { locale: 'en-us' },
      logger: { info: () => undefined, error: () => undefined, warn: (message: string) => warnings.push(message) },
      project: { localizedResources: () => new Map([[resource.name, resource]]) },
    } as unknown as ServeContext;
    const plugin = localizationPlugin(context);
    const resolveId = plugin.resolveId as (source: string, importer?: string) => string | null;
    const load = plugin.load as (this: { addWatchFile(file: string): void }, id: string) => Promise<string | null>;
    const pluginContext = { addWatchFile: (file: string) => watched.push(file) };
    const id = resolveId(resource.name, path.join(dir, 'a.ts')) ?? '';
    return { warnings, watched, load: () => load.call(pluginContext, id) };
  }

  it('serves TypeScript loc files and warns once that heft cannot load ES module loc files', async () => {
    const file = path.join(dir, 'en-us.ts');
    writeFileSync(file, "const strings: { Title: string } = { Title: 'Hi' };\nexport default strings;\n");
    const { warnings, watched, load } = loadStrings({ name: 'HelloStrings', file, locale: 'en-us' });
    expect(await load()).toBe(renderLocModule({ Title: 'Hi' }));
    await load();
    expect(watched).toContain(file);
    expect(warnings).toEqual([expect.stringMatching(/^HelloStrings: en-us\.ts is an ES\/CommonJS module\. fast-serve loads it, but heft/)]);
  });

  it('does not warn about AMD loc files', async () => {
    const file = path.join(dir, 'en-us.ts');
    writeFileSync(file, "declare const define: (deps: string[], factory: () => object) => void;\ndefine([], () => ({ Title: 'Hi' }));\n");
    const { warnings, load } = loadStrings({ name: 'HelloStrings', file, locale: 'en-us' });
    expect(await load()).toBe(renderLocModule({ Title: 'Hi' }));
    expect(warnings).toEqual([]);
  });
});

describe('renderLocModule', () => {
  it('exports the object as default and identifier keys by name', () => {
    const code = renderLocModule({ Title: 'Hello', 'not-id': 'x' });
    expect(code).toContain('export default strings;');
    expect(code).toContain('export { __s0 as Title };');
    expect(code).not.toContain('as not-id');
  });
});
