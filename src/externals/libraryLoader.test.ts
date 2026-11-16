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

  it('serializes failure reasons that are plain objects', async () => {
    const { fastServe } = await installLibraryLoader(() => rejectAsSharePointDoes({ code: 42 }));
    await expect(fastServe.loadLibrary(core)).rejects.toThrow('from SharePoint: {"code":42}');
  });
});
