import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, type DevEnvironment, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import { createExternals } from '../externals/index.js';
import { createProject } from '../project/index.js';
import { requireImportsPlugin } from './requireImports.js';

const SERVED_IMPORT = /(\bfrom\s*|\bimport\s*\(?\s*)"(\/[^"]+)"/g;

const projectFiles: Record<string, string> = {
  'package.json': '{ "name": "fixture", "version": "1.0.0", "dependencies": { "@microsoft/sp-core-library": "1.24.1" } }',
  'config/config.json': '{ "version": "2.0", "bundles": {}, "externals": { "jquery": "https://code.jquery.com/jquery-3.7.1.min.js" } }',
  'node_modules/@microsoft/sp-core-library/package.json': '{ "name": "@microsoft/sp-core-library", "version": "1.24.1", "module": "lib/index.js" }',
  'node_modules/@microsoft/sp-core-library/lib/index.js': 'export const Version = {};\n',
  'node_modules/@microsoft/sp-core-library/dist/sp-core-library.manifest.json':
    '{ "id": "7263c7d0-1d6a-45ec-8d85-d4d1d234171b", "alias": "SPCoreLibrary", "componentType": "Library", "version": "1.24.1", "manifestVersion": 2 }',
  'node_modules/cjs-dep/package.json': '{ "name": "cjs-dep", "version": "1.0.0", "main": "index.js" }',
  'node_modules/cjs-dep/index.js': 'globalThis.__cjsDepEvaluations = (globalThis.__cjsDepEvaluations || 0) + 1;\nmodule.exports = { answer: 42 };\n',
  'node_modules/fn-dep/package.json': '{ "name": "fn-dep", "version": "1.0.0", "main": "index.js" }',
  'node_modules/fn-dep/index.js': 'module.exports = function fnDep() { return "called"; };\n',
  'node_modules/flagged-dep/package.json': '{ "name": "flagged-dep", "version": "1.0.0", "main": "index.js" }',
  'node_modules/flagged-dep/index.js': 'Object.defineProperty(exports, "__esModule", { value: true });\nexports.default = "flagged-default";\nexports.named = 3;\n',
  'node_modules/esm-dep/package.json': '{ "name": "esm-dep", "version": "1.0.0", "type": "module", "exports": "./index.js" }',
  'node_modules/esm-dep/index.js': 'export const answer = 7;\nexport default "esm-default";\n',
  'node_modules/cjs-dep/data.json': '{ "items": [1, 2] }',
};

function fixtureContext(root: string): ServeContext {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return { root, project: createProject(root, logger), logger, options: { origin: 'https://localhost:4400' } as ServeContext['options'] };
}

async function evaluateServedModule(environment: DevEnvironment, url: string, outDir: string): Promise<Record<string, unknown>> {
  const written = new Map<string, string>();
  const write = async (moduleUrl: string): Promise<string> => {
    const known = written.get(moduleUrl);
    if (known) return known;
    const fileName = `${createHash('sha1').update(moduleUrl).digest('hex').slice(0, 12)}.mjs`;
    written.set(moduleUrl, fileName);
    const result = await environment.transformRequest(moduleUrl.replace(/^\/@id\/__x00__/, '\0').replace(/^\/@id\//, ''));
    if (!result) throw new Error(`${moduleUrl} was not served`);
    const imports = [...new Set(Array.from(result.code.matchAll(SERVED_IMPORT), ([, , imported]) => imported ?? ''))];
    const importedFiles = await Promise.all(imports.map(write));
    const code = imports.reduce((current, imported, index) => current.replaceAll(`"${imported}"`, JSON.stringify(`./${importedFiles[index] ?? ''}`)), result.code);
    writeFileSync(path.join(outDir, fileName), code);
    return fileName;
  };
  const entry = await write(url);
  return (await import(pathToFileURL(path.join(outDir, entry)).href)) as Record<string, unknown>;
}

describe('bare package requires through Vite', () => {
  let projectRoot: string | undefined;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    delete (globalThis as { __cjsDepEvaluations?: number }).__cjsDepEvaluations;
    delete (globalThis as { window?: unknown }).window;
    server = undefined;
    projectRoot = undefined;
  });

  async function serve(files: Record<string, string>): Promise<ViteDevServer> {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-require-deps-'));
    for (const [file, content] of Object.entries({ ...projectFiles, ...files })) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), content);
    }
    const context = fixtureContext(projectRoot);
    const externals = createExternals(context);
    server = await createServer({
      root: projectRoot,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { entries: ['src/Hello.ts'] },
      plugins: [externals.plugin, externals.importsPlugin, requireImportsPlugin(context)],
    });
    return server;
  }

  it('gives module.exports for CommonJS packages and the namespace for ES modules, like webpack', async () => {
    const vite = await serve({
      'src/Hello.ts': [
        "import { local } from './local';",
        "require('cjs-dep');",
        'export const cjs: any = require("cjs-dep");',
        "export const fn: any = require('fn-dep');",
        "export const flagged: any = require('flagged-dep');",
        "export const esm: any = require('esm-dep');",
        "export const data: any = require('cjs-dep/data.json');",
        'export { local };',
        '',
      ].join('\n'),
      'src/local.ts': 'export const local = 1;\n',
    });
    const outDir = path.join(projectRoot ?? '', 'evaluated');
    mkdirSync(outDir);

    const hello = await evaluateServedModule(vite.environments.client, '/src/Hello.ts', outDir);

    expect(hello.cjs).toEqual({ answer: 42 });
    expect((globalThis as { __cjsDepEvaluations?: number }).__cjsDepEvaluations).toBe(1);
    expect(typeof hello.fn).toBe('function');
    expect((hello.fn as () => string)()).toBe('called');
    expect(hello.flagged).toMatchObject({ __esModule: true, default: 'flagged-default', named: 3 });
    expect(Object.prototype.toString.call(hello.esm)).toBe('[object Module]');
    expect(hello.esm).toMatchObject({ answer: 7, default: 'esm-default' });
    expect(hello.data).toEqual({ items: [1, 2] });
    expect(hello.local).toBe(1);
  });

  it('gives SPFx libraries and config.json externals the module object exactly as RequireJS returns it', async () => {
    const vite = await serve({
      'src/Hello.ts': "export const core: any = require('@microsoft/sp-core-library');\nexport const jquery: any = require('jquery');\n",
    });
    const outDir = path.join(projectRoot ?? '', 'evaluated');
    mkdirSync(outDir);
    const coreModule = { Version: { parse: () => undefined } };
    const jqueryModule = Object.assign(() => undefined, { fn: {} });
    (globalThis as { window?: unknown }).window = {
      __spfxFastServe: { loadLibrary: () => Promise.resolve(coreModule), loadExternal: () => Promise.resolve(jqueryModule) },
    };

    const hello = await evaluateServedModule(vite.environments.client, '/src/Hello.ts', outDir);

    expect(hello.core).toBe(coreModule);
    expect(hello.jquery).toBe(jqueryModule);
  });

  it('lets the dependency optimizer find the required packages before the page asks for them', async () => {
    const vite = await serve({ 'src/Hello.ts': "export const cjs: any = require('cjs-dep');\n" });
    const optimizer = vite.environments.client.depsOptimizer;
    await optimizer?.scanProcessing;
    const metadata = optimizer?.metadata;
    expect(Object.keys({ ...metadata?.optimized, ...metadata?.discovered })).toContain('cjs-dep');
  });
});
