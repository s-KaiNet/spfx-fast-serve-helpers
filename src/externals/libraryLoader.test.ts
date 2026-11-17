import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { FastServeGlobal, ScopedRequire, SpfxLibraryReference } from '../runtime/contracts.js';
import { readRuntimeSource } from '../utils/runtimeSource.js';

const core: SpfxLibraryReference = { name: '@microsoft/sp-core-library', id: 'core-id', version: '1.24.1' };

async function installLibraryLoader(loadComponentById: (id: string, version?: string) => Promise<unknown>) {
  const runtime = await readRuntimeSource('libraryLoader');
  const window: { __spfxFastServe?: FastServeGlobal } = {};
  const console = { error: vi.fn<(error: unknown) => void>() };
  runInNewContext(`var __SPFX_LIBRARY_LOADER__ = { componentLoaderModule: "@microsoft/sp-loader" };\n${runtime}`, {
    window,
    console,
    Promise,
    Error,
    JSON,
    Map,
    Object,
    String,
  });
  const fastServe = window.__spfxFastServe;
  if (!fastServe) throw new Error('library loader not installed');
  const scopedRequire = vi.fn<ScopedRequire>((_names, onLoad) => {
    onLoad({ SPComponentLoader: { loadComponentById } });
  });
  fastServe.useScopedRequire(scopedRequire);
  return { fastServe, scopedRequire, console };
}

const rejectAsSharePointDoes = runInNewContext('(reason) => Promise.reject(reason)') as (reason: object) => Promise<never>;

describe('library loader runtime', () => {
  it('loads each library once by id and version through SPComponentLoader', async () => {
    const instance = { Version: 1 };
    const loadComponentById = vi.fn<(id: string, version?: string) => Promise<unknown>>(() => Promise.resolve(instance));
    const { fastServe, scopedRequire } = await installLibraryLoader(loadComponentById);

    const [first, second] = await Promise.all([fastServe.loadLibrary(core), fastServe.loadLibrary(core)]);

    expect(first).toBe(instance);
    expect(second).toBe(instance);
    expect(loadComponentById).toHaveBeenCalledTimes(1);
    expect(loadComponentById).toHaveBeenCalledWith('core-id', '1.24.1');
    expect(scopedRequire).toHaveBeenCalledTimes(1);
    expect(scopedRequire.mock.calls[0]?.[0]).toEqual(['@microsoft/sp-loader']);
    expect(fastServe.loadedLibrary(core)).toBe(instance);
  });

  it('refuses synchronous access to a library that was not preloaded', async () => {
    const { fastServe } = await installLibraryLoader(() => Promise.resolve({}));
    expect(() => fastServe.loadedLibrary(core)).toThrow(
      '[fast-serve] SPFx library "@microsoft/sp-core-library" (component core-id, version 1.24.1) was required before it was preloaded.',
    );
  });

  it('reports load failures with the package, id, version and the real reason', async () => {
    const reason = { message: 'Cannot find manifest for core-id_1.24.1. Store had [1.25.0]' };
    const { fastServe, console } = await installLibraryLoader(() => rejectAsSharePointDoes(reason));

    await expect(fastServe.loadLibrary(core)).rejects.toThrow(
      '[fast-serve] Cannot load SPFx library "@microsoft/sp-core-library" (component core-id, version 1.24.1) from SharePoint: ' +
        'Cannot find manifest for core-id_1.24.1. Store had [1.25.0]',
    );
    expect(console.error).toHaveBeenCalledTimes(1);
  });

  it('explains when the page serves only an older version than the project requests', async () => {
    const reason = { message: 'Cannot find manifest for core-id_1.24.1. Store had [1.23.0]' };
    const { fastServe } = await installLibraryLoader(() => rejectAsSharePointDoes(reason));

    await expect(fastServe.loadLibrary(core)).rejects.toThrow(
      'from SharePoint: this SharePoint serves @microsoft/sp-core-library 1.23.0, older than 1.24.1 used by the project. ' +
        'The project uses a newer SPFx version than this tenant supports',
    );
  });

  it('does not blame the tenant version when it is newer', async () => {
    const reason = { message: 'Cannot find manifest for core-id_1.24.1. Store had [1.25.0]' };
    const { fastServe } = await installLibraryLoader(() => rejectAsSharePointDoes(reason));

    await expect(fastServe.loadLibrary(core)).rejects.not.toThrow('older than');
  });

  it('serializes failure reasons that are plain objects', async () => {
    const { fastServe } = await installLibraryLoader(() => rejectAsSharePointDoes({ code: 42 }));
    await expect(fastServe.loadLibrary(core)).rejects.toThrow('from SharePoint: {"code":42}');
  });
});

describe('config.json externals in the library loader runtime', () => {
  it('requires each external once with the component-scoped require', async () => {
    const jquery = { fn: { jquery: '3.7.1' } };
    const { fastServe, scopedRequire } = await installLibraryLoader(() => Promise.resolve({}));
    scopedRequire.mockImplementation((names, onLoad) => {
      onLoad(names[0] === 'jquery' ? jquery : undefined);
    });

    expect(() => fastServe.loadedExternal('jquery')).toThrow(
      '[fast-serve] config/config.json external "jquery" was required before it was preloaded.',
    );
    await fastServe.preloadExternals(['jquery']);
    expect(await fastServe.loadExternal('jquery')).toBe(jquery);
    expect(fastServe.loadedExternal('jquery')).toBe(jquery);
    expect(scopedRequire).toHaveBeenCalledTimes(1);
    expect(scopedRequire.mock.calls[0]?.[0]).toEqual(['jquery']);
  });

  it('reports RequireJS failures with the external name', async () => {
    const { fastServe, scopedRequire, console } = await installLibraryLoader(() => Promise.resolve({}));
    scopedRequire.mockImplementation((_names, _onLoad, onError) => {
      onError({ message: 'Script error for "x/jquery"' });
    });

    await expect(fastServe.loadExternal('jquery')).rejects.toThrow(
      '[fast-serve] Cannot load "jquery" from config/config.json "externals": Script error for "x/jquery"',
    );
    expect(console.error).toHaveBeenCalledTimes(1);
  });
});
