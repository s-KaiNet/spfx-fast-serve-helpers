import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { FastServeContext } from './context.js';
import { ExtendLoadError, loadExtendFile } from './load.js';

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-load-extend-'));
  createdRoots.push(root);
  const all: Record<string, string> = {
    'package.json': '{ "name": "contoso-project", "version": "1.0.0" }',
    'node_modules/contoso-pkg/package.json': '{ "name": "contoso-pkg", "version": "1.0.0", "main": "index.cjs" }',
    'node_modules/contoso-pkg/index.cjs': 'module.exports = function contosoUrl(path) { return "https://api.contoso.com/" + path; };',
    ...files,
  };
  for (const [file, content] of Object.entries(all)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

function contextFor(root: string): FastServeContext {
  return {
    root,
    port: 4400,
    origin: 'https://localhost:4400',
    publicPath: 'https://localhost:4400/dist/',
    locale: 'en-us',
    serveConfiguration: 'default',
    pageUrl: undefined,
    spfxVersion: '1.23.2',
    fastServeVersion: '1.23.0-beta.5',
    rspackVersion: '2.3.3',
  };
}

async function loadError(file: string, root: string): Promise<ExtendLoadError> {
  try {
    await loadExtendFile(file, contextFor(root));
  } catch (error) {
    if (error instanceof ExtendLoadError) return error;
    throw error;
  }
  throw new Error('expected the extend file to fail');
}

describe('loadExtendFile', () => {
  it('loads a plain object from .mjs', async () => {
    const root = projectWith({ 'fast-serve/rspack.extend.mjs': "export default { resolve: { alias: { '@src': 'src' } } };" });
    const loaded = await loadExtendFile(path.join(root, 'fast-serve/rspack.extend.mjs'), contextFor(root));
    expect(loaded.config).toEqual({ resolve: { alias: { '@src': 'src' } } });
    expect(loaded.dependencies).toEqual([path.join(root, 'fast-serve/rspack.extend.mjs')]);
    expect(readdirSync(path.join(root, 'fast-serve'))).toEqual(['rspack.extend.mjs']);
  });

  it('compiles .mts, calls the config function with context and env, and follows local imports', async () => {
    const root = projectWith({
      'fast-serve/rspack.extend.mts': [
        "import path from 'node:path';",
        "import contosoUrl from 'contoso-pkg';",
        "import { apiUrl, helperDir } from '../scripts/helpers.js';",
        "import { label } from '../scripts/label.cjs';",
        'interface Env { mode: string }',
        'export default async ({ root, port }: { root: string; port: number }, env: Env) => ({',
        "  name: [apiUrl(), helperDir, label, contosoUrl('v1'), path.basename(root) === path.basename(process.cwd()) || 'other', port, env.mode].join(' '),",
        '});',
      ].join('\n'),
      'scripts/helpers.ts': "import settings from './settings.json';\nexport const apiUrl = (): string => settings.api;\nexport const helperDir: string = require('path').basename(__dirname);",
      'scripts/settings.json': '{ "api": "https://contoso.example/api" }',
      'scripts/label.cjs': "exports.label = 'contoso-' + require('node:path').basename(__filename);",
    });
    const loaded = await loadExtendFile(path.join(root, 'fast-serve/rspack.extend.mts'), contextFor(root));
    expect(loaded.config.name).toBe('https://contoso.example/api scripts contoso-label.cjs https://api.contoso.com/v1 other 4400 development');
    expect(loaded.dependencies).toEqual(
      ['fast-serve/rspack.extend.mts', 'scripts/helpers.ts', 'scripts/label.cjs', 'scripts/settings.json'].map((file) => path.join(root, file)),
    );
  });

  it('loads module.exports from .cjs and a promise export', async () => {
    const cjs = projectWith({ 'fast-serve/rspack.extend.cjs': "module.exports = { name: 'cjs' };" });
    expect((await loadExtendFile(path.join(cjs, 'fast-serve/rspack.extend.cjs'), contextFor(cjs))).config).toEqual({ name: 'cjs' });
    const promised = projectWith({ 'fast-serve/rspack.extend.mjs': "export default Promise.resolve({ name: 'later' });" });
    expect((await loadExtendFile(path.join(promised, 'fast-serve/rspack.extend.mjs'), contextFor(promised))).config).toEqual({ name: 'later' });
  });

  it('reports syntax errors with the file and keeps the dependency list', async () => {
    const root = projectWith({
      'fast-serve/rspack.extend.mjs': "import { value } from '../scripts/broken.mjs';\nexport default { name: value };",
      'scripts/broken.mjs': 'export const value = ;',
    });
    const error = await loadError(path.join(root, 'fast-serve/rspack.extend.mjs'), root);
    expect(error.message).toContain('scripts/broken.mjs');
    expect(error.dependencies).toContain(path.join(root, 'scripts/broken.mjs'));
    expect(readdirSync(path.join(root, 'fast-serve'))).toEqual(['rspack.extend.mjs']);
  });

  it('reports missing local imports, thrown errors and wrong exports', async () => {
    const missing = projectWith({ 'fast-serve/rspack.extend.mjs': "import '../scripts/nope.mjs';\nexport default {};" });
    expect((await loadError(path.join(missing, 'fast-serve/rspack.extend.mjs'), missing)).message).toMatch(/nope\.mjs/);
    const throwing = projectWith({ 'fast-serve/rspack.extend.mjs': "export default () => { throw new Error('contoso boom'); };" });
    expect((await loadError(path.join(throwing, 'fast-serve/rspack.extend.mjs'), throwing)).message).toContain('contoso boom');
    const wrong = projectWith({ 'fast-serve/rspack.extend.mjs': 'export default () => 42;' });
    expect((await loadError(path.join(wrong, 'fast-serve/rspack.extend.mjs'), wrong)).message).toBe(
      'its config function returned a number; export default a Rspack configuration object or defineConfig((context, env) => ({ … }))',
    );
    const none = projectWith({ 'fast-serve/rspack.extend.mjs': 'export const config = {};' });
    expect((await loadError(path.join(none, 'fast-serve/rspack.extend.mjs'), none)).message).toContain('its default export is undefined');
  });

  it('evaluates helpers again on every load', async () => {
    const root = projectWith({ 'fast-serve/rspack.extend.mjs': "import { value } from '../scripts/value.mjs';\nexport default { name: value };", 'scripts/value.mjs': "export const value = 'one';" });
    const file = path.join(root, 'fast-serve/rspack.extend.mjs');
    expect((await loadExtendFile(file, contextFor(root))).config.name).toBe('one');
    writeFileSync(path.join(root, 'scripts/value.mjs'), "export const value = 'two';");
    expect((await loadExtendFile(file, contextFor(root))).config.name).toBe('two');
  });
});
