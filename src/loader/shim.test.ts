import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import type { SpfxBundle } from '../project/index.js';
import { renderBundleEntry } from './entry.js';
import { bundleEntryPath, bundleShimPath, parseBundleEntryPath, parseBundleShimPath } from './paths.js';
import { createShimConfig, renderShim } from './shim.js';

const bundle: SpfxBundle = {
  name: 'hello-web-part',
  components: [
    {
      bundleName: 'hello-web-part',
      manifestFile: '/p/src/webparts/hello/HelloWebPart.manifest.json',
      entryFile: '/p/src/webparts/hello/HelloWebPart.ts',
      manifest: { id: 'abc', alias: 'HelloWebPart', componentType: 'WebPart', version: '1.0.0' },
    },
  ],
};

describe('loader paths', () => {
  it('round-trips bundle names', () => {
    expect(bundleShimPath('hello-web-part')).toBe('@spfx/bundle/hello-web-part.js');
    expect(parseBundleShimPath('/' + bundleShimPath('hello-web-part'))).toBe('hello-web-part');
    expect(parseBundleShimPath('/src/x.js')).toBeUndefined();
    expect(parseBundleEntryPath(bundleEntryPath('hello-web-part'))).toBe('hello-web-part');
  });
});

describe('renderShim', () => {
  type Factory = (...modules: unknown[]) => unknown;

  async function evaluateShim(preload: string[]) {
    const code = await renderShim(createShimConfig(bundle, 'https://localhost:4321', { preload }));
    const modules = new Map<string, { deps: string[]; factory: Factory }>();
    const define = (id: string, deps: string[], factory: Factory) => modules.set(id, { deps, factory });
    const window: { __spfxFastServe?: { externals: Record<string, unknown> } } = {};
    runInNewContext(code, { define, window, console, Promise, URL });
    return { modules, window };
  }

  it('defines one module per component through a loader plugin', async () => {
    const { modules } = await evaluateShim([]);
    expect([...modules.keys()]).toEqual(['spfx-fast-serve-loader:hello-web-part', 'abc_1.0.0']);
    expect(modules.get('abc_1.0.0')?.deps).toEqual(['spfx-fast-serve-loader:hello-web-part!/@spfx/entry/hello-web-part']);
    const entry = { default: 'HelloWebPart class' };
    expect(modules.get('abc_1.0.0')?.factory(entry)).toBe(entry);
  });

  it('preloads externals with the scoped require before importing the entry', async () => {
    const { modules, window } = await evaluateShim(['@microsoft/sp-core-library']);
    const plugin = modules.get('spfx-fast-serve-loader:hello-web-part')?.factory() as {
      load(name: string, req: unknown, onload: { (v: unknown): void; error(e: unknown): void }): void;
    };
    const core = { Version: 1 };
    const scopedRequire = vi.fn((_names: string[], onLoad: (...m: unknown[]) => void) => {
      onLoad(core);
    });
    const onload = Object.assign(vi.fn(), { error: vi.fn() });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    plugin.load('/@spfx/entry/hello-web-part', scopedRequire, onload);

    await vi.waitFor(() => {
      expect(onload.error).toHaveBeenCalled();
    });
    expect(scopedRequire).toHaveBeenCalledWith(['@microsoft/sp-core-library'], expect.any(Function), expect.any(Function));
    expect(window.__spfxFastServe?.externals['@microsoft/sp-core-library']).toBe(core);
  });
});

describe('renderBundleEntry', () => {
  it('imports the Fast Refresh preamble first and reloads on unaccepted updates', () => {
    const code = renderBundleEntry('/p', bundle);
    expect(code.split('\n')[0]).toBe("import '@vitejs/plugin-react/preamble';");
    expect(code).toContain('export * from "/src/webparts/hello/HelloWebPart.ts";');
    expect(code).toContain('export { default } from "/src/webparts/hello/HelloWebPart.ts";');
    expect(code).toContain('import.meta.hot.accept(() => location.reload())');
  });
});
