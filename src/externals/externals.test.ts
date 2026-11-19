import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import type { Connect, Plugin, Rolldown, UserConfig } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import type { SpfxLibraryReference } from '../runtime/contracts.js';
import { readExportNames } from './exportNames.js';
import {
  renderChunkPreload,
  renderCommonJsFacade,
  renderEsmFacade,
  renderExternalCommonJsFacade,
  renderExternalEsmFacade,
} from './facade.js';
import { createExternals } from './index.js';

const fixtures = fileURLToPath(new URL('../../test/fixtures/', import.meta.url));
const root = path.join(fixtures, 'basic');
const modulesDir = path.join(root, 'node_modules');
const core: SpfxLibraryReference = { name: '@microsoft/sp-core-library', id: '7263c7d0-1d6a-45ec-8d85-d4d1d234171b', version: '1.24.1' };
const lodash: SpfxLibraryReference = { name: '@microsoft/sp-lodash-subset', id: '73e1dc6c-8441-42cc-ad47-4bd3659f8a3a', version: '1.24.1' };

function createFixtureExternals() {
  const warnings: string[] = [];
  const logger = { info: () => undefined, warn: (message: string) => warnings.push(message), error: () => undefined };
  const context: ServeContext = {
    root,
    project: createProject(root, logger),
    logger,
    options: { port: 4400, origin: 'https://localhost:4400', locale: 'en-us', pageUrl: undefined, pageUrlTemplate: undefined, serveConfiguration: undefined, overlay: true, warnings: [] },
  };
  return { externals: createExternals(context), warnings };
}

function prebundlePlugin(plugin: Plugin): Rolldown.Plugin {
  const config = (plugin.config as () => UserConfig)();
  const [prebundle] = (config.optimizeDeps?.rolldownOptions?.plugins ?? []) as Rolldown.Plugin[];
  if (!prebundle) throw new Error('no pre-bundle plugin');
  return prebundle;
}

describe('readExportNames', () => {
  it('follows export * in the ESM entry', async () => {
    expect(await readExportNames(path.join(modulesDir, '@microsoft/sp-core-library'))).toEqual(['Guid', 'Log', 'Version']);
  });

  it('evaluates the AMD blob that sp-lodash-subset ships in its ESM folder', async () => {
    expect(await readExportNames(path.join(modulesDir, '@microsoft/sp-lodash-subset'))).toEqual(['cloneDeep', 'escape', 'isEqual']);
  });

  it('evaluates CommonJS packages without ESM exports', async () => {
    expect(await readExportNames(path.join(modulesDir, 'plain-lib'))).toEqual(['escape']);
  });
});

describe('facades', () => {
  it('awaits the library by id and version and re-exports default and named exports', () => {
    const code = renderEsmFacade(core, ['Version', 'delete']);
    expect(code).toContain(`const library = await window.__spfxFastServe.loadLibrary(${JSON.stringify(core)});`);
    expect(code).toContain('export default (library.default !== undefined ? library.default : library);');
    expect(code).toContain('const __e0 = library["Version"];\nexport { __e0 as Version };');
    expect(code).toContain('export { __e1 as delete };');
  });

  it('gives CommonJS importers a synchronous facade over the preloaded library', () => {
    expect(renderCommonJsFacade(lodash)).toBe(`module.exports = window.__spfxFastServe.loadedLibrary(${JSON.stringify(lodash)});\n`);
  });

  it('preloads all libraries of a chunk in one await', () => {
    expect(renderChunkPreload({ libraries: [core, lodash], externals: [] })).toBe(
      `await window.__spfxFastServe.preloadLibraries(${JSON.stringify([core, lodash])});`,
    );
  });

  it('preloads libraries and config externals of a chunk together', () => {
    expect(renderChunkPreload({ libraries: [core], externals: ['jquery'] })).toBe(
      `await Promise.all([window.__spfxFastServe.preloadLibraries(${JSON.stringify([core])}), window.__spfxFastServe.preloadExternals(["jquery"])]);`,
    );
    expect(renderChunkPreload({ libraries: [], externals: [] })).toBe('');
  });

  it('loads config externals through RequireJS, unwraps ES module interop and exposes the raw module object', () => {
    const code = renderExternalEsmFacade('jquery');
    expect(code).toContain('const external = await window.__spfxFastServe.loadExternal("jquery");');
    expect(code).toContain('export default (isEsModule ? external.default : external);');
    expect(code).toContain('export { external as __spfxExternalModule };');
    expect(code).not.toContain('ajax');
    expect(renderExternalCommonJsFacade('jquery')).toBe('module.exports = window.__spfxFastServe.loadedExternal("jquery");\n');
  });
});

describe('config external facade at runtime', () => {
  const host = globalThis as { window?: unknown };
  let outDir: string | undefined;

  afterEach(() => {
    delete host.window;
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  async function importFacade(external: unknown, fileName: string) {
    host.window = { __spfxFastServe: { loadExternal: () => Promise.resolve(external) } };
    outDir ??= mkdtempSync(path.join(tmpdir(), 'fast-serve-facade-'));
    const file = path.join(outDir, fileName);
    writeFileSync(file, renderExternalEsmFacade('lib'));
    return (await import(pathToFileURL(file).href)) as { default: unknown; __spfxExternalModule: unknown; __spfxExternalNamespace: Record<string, unknown> };
  }

  it('gives the raw object, the default by the webpack __esModule rule and a webpack-like namespace', async () => {
    const ejs = { render: () => 'rendered' };
    const facade = await importFacade(ejs, 'ejs.mjs');
    expect(facade.__spfxExternalModule).toBe(ejs);
    expect(facade.default).toBe(ejs);
    expect(facade.__spfxExternalNamespace.render).toBe(ejs.render);
    expect(facade.__spfxExternalNamespace.default).toBe(ejs);

    const Chart = Object.assign(
      class {
        readonly kind = 'chart';
      },
      { exec: () => undefined },
    );
    const charts = await importFacade(Chart, 'charts.mjs');
    expect(charts.__spfxExternalModule).toBe(Chart);
    expect(charts.default).toBe(Chart);
    expect(charts.__spfxExternalNamespace.default).toBe(Chart);

    const transpiled = { __esModule: true, default: 'value', named: 1 };
    const esModule = await importFacade(transpiled, 'es.mjs');
    expect(esModule.default).toBe('value');
    expect(esModule.__spfxExternalNamespace).toBe(transpiled);

    const empty = await importFacade(undefined, 'empty.mjs');
    expect(empty.default).toBeUndefined();
    expect(empty.__spfxExternalModule).toBeUndefined();
  });
});

describe('createExternals', () => {
  it('lists sp-loader and the config.json externals in the debug manifest', () => {
    const { externals } = createFixtureExternals();
    expect(externals.manifestScriptResources()).toEqual({
      '@microsoft/sp-loader': { type: 'component', id: '1c6c9123-7aac-41f3-a376-3caea41ed83f', version: '1.24.1' },
      jquery: { type: 'path', path: 'https://code.jquery.com/jquery-3.7.1.min.js' },
      'legacy-plugin': {
        type: 'path',
        path: 'https://localhost:4400/@spfx/external/legacy-plugin.js',
        globalName: 'LegacyPlugin',
        globalDependencies: ['jquery'],
      },
    });
  });

  it('resolves config.json externals to facades, SPFx libraries win over externals with the same name', async () => {
    const { externals } = createFixtureExternals();
    const resolveId = externals.plugin.resolveId as (source: string, importer?: string) => string | null;
    const load = externals.plugin.load as (id: string) => Promise<string | null>;
    expect(resolveId('jquery', '/src/a.ts')).toBe('\0spfx-external:jquery');
    expect(resolveId('legacy-plugin', '/src/a.ts')).toBe('\0spfx-external:legacy-plugin');
    expect(resolveId('missing-file', '/src/a.ts')).toBeNull();
    expect(resolveId('@microsoft/sp-core-library', '/src/a.ts')).toBe('\0spfx-library:@microsoft/sp-core-library');
    expect(await load('\0spfx-external:jquery')).toBe(renderExternalEsmFacade('jquery'));
    expect(await load('\0spfx-external:legacy-plugin')).toBe(renderExternalEsmFacade('legacy-plugin'));
  });

  it('pre-bundles imports of config externals through the CommonJS facade, SPFx libraries keep the ESM facade', () => {
    const { externals } = createFixtureExternals();
    const resolve = prebundlePlugin(externals.plugin).resolveId as { handler: (source: string, importer: string | undefined, options: { kind: string }) => string | null };
    expect(resolve.handler('jquery', '/m/index.js', { kind: 'import-statement' })).toBe('\0spfx-external-cjs:jquery');
    expect(resolve.handler('jquery', '/m/index.js', { kind: 'dynamic-import' })).toBe('\0spfx-external-cjs:jquery');
    expect(resolve.handler('jquery', '/m/index.js', { kind: 'require-call' })).toBe('\0spfx-external-cjs:jquery');
    expect(resolve.handler('@microsoft/sp-core-library', '/m/index.js', { kind: 'import-statement' })).toBe('\0spfx-library:@microsoft/sp-core-library');
  });

  it('serves local external files as classic scripts', async () => {
    const { externals } = createFixtureExternals();
    const middlewares: { route: string; handle: Connect.NextHandleFunction }[] = [];
    const server = { middlewares: { use: (route: string, handle: Connect.NextHandleFunction) => middlewares.push({ route, handle }) } };
    (externals.plugin.configureServer as (server: unknown) => void)(server);
    const [middleware] = middlewares;
    expect(middleware?.route).toBe('/@spfx/external/');

    const served = await new Promise<{ body: string; type: unknown }>((resolve, reject) => {
      const headers = new Map<string, unknown>();
      const res = {
        setHeader: (name: string, value: unknown) => headers.set(name, value),
        end: (body: string) => {
          resolve({ body, type: headers.get('Content-Type') });
        },
      };
      middleware?.handle({ url: '/legacy-plugin.js', method: 'GET' } as Connect.IncomingMessage, res as never, reject);
    });
    expect(served).toEqual({ body: readFileSync(path.join(root, 'assets/legacy-plugin.js'), 'utf8'), type: 'application/javascript; charset=utf-8' });

    const next = vi.fn<() => void>();
    middleware?.handle({ url: '/jquery.js', method: 'GET' } as Connect.IncomingMessage, {} as never, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('resolves SPFx libraries to facades, except inside style requests', async () => {
    const { externals } = createFixtureExternals();
    const resolveId = externals.plugin.resolveId as (source: string, importer?: string) => string | null;
    const load = externals.plugin.load as (id: string) => Promise<string | null>;
    expect(resolveId('react', '/src/a.ts')).toBeNull();
    expect(resolveId('@microsoft/sp-core-library', '/src/a.scss')).toBeNull();
    const id = resolveId('@microsoft/sp-core-library', '/src/a.ts');
    expect(id).toBe('\0spfx-library:@microsoft/sp-core-library');
    expect(await load(id ?? '')).toBe(renderEsmFacade(core, ['Guid', 'Log', 'Version']));
  });

  it('installs the library loader in the shim prelude', async () => {
    const { externals } = createFixtureExternals();
    expect(await externals.shimPrelude()).toContain('var __SPFX_LIBRARY_LOADER__ = {"componentLoaderModule":"@microsoft/sp-loader"};');
  });
});

describe('pre-bundling with facades', () => {
  const host = globalThis as { window?: unknown };
  let outDir: string | undefined;

  afterEach(() => {
    delete host.window;
    if (outDir) rmSync(outDir, { recursive: true, force: true });
  });

  it('uses a sync facade for require() and one preload per chunk, sharing the page instances', async () => {
    const { externals } = createFixtureExternals();
    const bundle = await rolldown({
      input: path.join(fixtures, 'prebundle/index.js'),
      plugins: [prebundlePlugin(externals.plugin)],
      platform: 'browser',
      logLevel: 'silent',
    });
    const { output } = await bundle.generate({ format: 'esm' });
    const [chunk] = output;
    expect(output).toHaveLength(1);
    expect(chunk.code.startsWith('await Promise.all([window.__spfxFastServe.preloadLibraries(')).toBe(true);
    expect(chunk.code.match(/preloadLibraries\(/g)).toHaveLength(1);
    expect(chunk.code.match(/preloadExternals\(\["jquery"\]\)/g)).toHaveLength(1);
    expect(chunk.code).toContain('loadedLibrary(');
    expect(chunk.code).toContain('loadedExternal("jquery")');

    const jquery = Object.assign(() => undefined, { ajax: () => 'ajax', fn: { jquery: '3.7.1' } });
    const pageInstances = new Map<string, unknown>([
      [core.name, { Version: { major: 1 } }],
      [lodash.name, { escape: () => 'escaped' }],
    ]);
    const requestedExternals: string[] = [];
    const requested: string[] = [];
    host.window = {
      __spfxFastServe: {
        loadLibrary: (library: SpfxLibraryReference) => {
          requested.push(library.name);
          return Promise.resolve(pageInstances.get(library.name));
        },
        preloadLibraries: (libraries: SpfxLibraryReference[]) =>
          Promise.all(libraries.map((library) => (host.window as { __spfxFastServe: { loadLibrary(l: SpfxLibraryReference): Promise<unknown> } }).__spfxFastServe.loadLibrary(library))),
        loadedLibrary: (library: SpfxLibraryReference) => pageInstances.get(library.name),
        loadExternal: (name: string) => {
          requestedExternals.push(name);
          return Promise.resolve(jquery);
        },
        preloadExternals: (names: string[]) => {
          requestedExternals.push(...names);
          return Promise.resolve();
        },
        loadedExternal: () => jquery,
      },
    };
    outDir = mkdtempSync(path.join(tmpdir(), 'fast-serve-prebundle-'));
    const file = path.join(outDir, 'chunk.mjs');
    writeFileSync(file, chunk.code);
    const prebundled = (await import(pathToFileURL(file).href)) as { result(): Record<string, unknown> };
    expect(prebundled.result()).toEqual({
      version: (pageInstances.get(core.name) as { Version: unknown }).Version,
      escape: (pageInstances.get(lodash.name) as { escape: unknown }).escape,
      ajax: jquery.ajax,
      namedAjax: jquery.ajax,
      jqueryVersion: '3.7.1',
    });
    expect(requestedExternals).toEqual(['jquery']);
    expect(requested.toSorted()).toEqual([core.name, core.name, lodash.name]);
  });
});
