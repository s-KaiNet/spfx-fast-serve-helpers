import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import type { Plugin, Rolldown, UserConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../context.js';
import { createProject } from '../project/index.js';
import type { SpfxLibraryReference } from '../runtime/contracts.js';
import { readExportNames } from './exportNames.js';
import { renderChunkPreload, renderCommonJsFacade, renderEsmFacade } from './facade.js';
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
    options: { port: 4400, origin: 'https://localhost:4400', locale: 'en-us', pageUrl: undefined, pageUrlTemplate: undefined },
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
    expect(renderChunkPreload([core, lodash])).toBe(`await window.__spfxFastServe.preloadLibraries(${JSON.stringify([core, lodash])});`);
  });
});

describe('createExternals', () => {
  it('lists only sp-loader in the debug manifest', () => {
    const { externals } = createFixtureExternals();
    expect(externals.manifestScriptResources()).toEqual({
      '@microsoft/sp-loader': { type: 'component', id: '1c6c9123-7aac-41f3-a376-3caea41ed83f', version: '1.24.1' },
    });
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
    expect(chunk.code.startsWith('await window.__spfxFastServe.preloadLibraries(')).toBe(true);
    expect(chunk.code.match(/preloadLibraries\(/g)).toHaveLength(1);
    expect(chunk.code).toContain('loadedLibrary(');

    const pageInstances = new Map<string, unknown>([
      [core.name, { Version: { major: 1 } }],
      [lodash.name, { escape: () => 'escaped' }],
    ]);
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
      },
    };
    outDir = mkdtempSync(path.join(tmpdir(), 'fast-serve-prebundle-'));
    const file = path.join(outDir, 'chunk.mjs');
    writeFileSync(file, chunk.code);
    const prebundled = (await import(pathToFileURL(file).href)) as { result(): { version: unknown; escape: unknown } };
    expect(prebundled.result()).toEqual({
      version: (pageInstances.get(core.name) as { Version: unknown }).Version,
      escape: (pageInstances.get(lodash.name) as { escape: unknown }).escape,
    });
    expect(requested.toSorted()).toEqual([core.name, core.name, lodash.name]);
  });
});
