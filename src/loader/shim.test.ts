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

const sharedBundle: SpfxBundle = {
  name: 'shared-bundle',
  components: [
    {
      bundleName: 'shared-bundle',
      manifestFile: '/p/src/webparts/first/FirstWebPart.manifest.json',
      entryFile: '/p/src/webparts/first/FirstWebPart.ts',
      exportName: 'a',
      manifest: { id: 'first', alias: 'FirstWebPart', componentType: 'WebPart', version: '0.0.1' },
    },
    {
      bundleName: 'shared-bundle',
      manifestFile: '/p/src/webparts/second/SecondWebPart.manifest.json',
      entryFile: '/p/src/webparts/second/SecondWebPart.ts',
      exportName: 'b',
      manifest: { id: 'second', alias: 'SecondWebPart', componentType: 'WebPart', version: '0.0.1' },
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

function fakeSharePointPage() {
  const errorText = { nodeValue: 'ERROR:[object Object]' };
  const queriedSelectors: string[] = [];
  let onMutation: (() => void) | undefined;
  const globals = {
    NodeFilter: { SHOW_TEXT: 4 },
    MutationObserver: class {
      constructor(callback: () => void) {
        onMutation = callback;
      }
      observe() {
        return undefined;
      }
      disconnect() {
        return undefined;
      }
    },
    document: {
      body: {},
      querySelectorAll: (selector: string) => {
        queriedSelectors.push(selector);
        return [{}];
      },
      createTreeWalker: () => {
        const nodes = [errorText];
        return { nextNode: () => nodes.shift() ?? null };
      },
    },
  };
  return { globals, errorText, queriedSelectors, mutate: () => onMutation?.() };
}

describe('renderShim', () => {
  type Factory = (...modules: unknown[]) => unknown;
  const prelude = 'window.__spfxFastServe = { useScopedRequire: function (req) { window.scopedRequire = req; } };';

  async function evaluateShim(shimBundle: SpfxBundle = bundle) {
    const code = await renderShim(createShimConfig(shimBundle, 'https://localhost:4321'), prelude);
    const modules = new Map<string, { deps: string[]; factory: Factory }>();
    const define = (id: string, deps: string[], factory: Factory) => modules.set(id, { deps, factory });
    const window: { scopedRequire?: unknown } = {};
    const page = fakeSharePointPage();
    runInNewContext(code, { define, window, console, Promise, URL, Error, String, Object, setTimeout, ...page.globals });
    return { code, modules, window, page };
  }

  it('runs the prelude before the shim', async () => {
    const { code } = await evaluateShim();
    expect(code.startsWith(prelude)).toBe(true);
  });

  it('defines one module per component through a loader plugin', async () => {
    const { modules } = await evaluateShim();
    expect([...modules.keys()]).toEqual(['spfx-fast-serve-loader:hello-web-part', 'abc_1.0.0']);
    expect(modules.get('abc_1.0.0')?.deps).toEqual(['spfx-fast-serve-loader:hello-web-part!/@spfx/entry/hello-web-part']);
    const entry = { default: 'HelloWebPart class' };
    expect(modules.get('abc_1.0.0')?.factory(entry)).toBe(entry);
  });

  it('defines every component of a shared bundle on top of one entry load', async () => {
    const { modules } = await evaluateShim(sharedBundle);
    const entryDependency = 'spfx-fast-serve-loader:shared-bundle!/@spfx/entry/shared-bundle';
    expect([...modules.keys()]).toEqual(['spfx-fast-serve-loader:shared-bundle', 'first_0.0.1', 'second_0.0.1']);
    expect(modules.get('first_0.0.1')?.deps).toEqual([entryDependency]);
    expect(modules.get('second_0.0.1')?.deps).toEqual([entryDependency]);
  });

  it('hands the scoped require to the library loader and shows entry failures instead of SharePoint\'s [object Object]', async () => {
    const { modules, window, page } = await evaluateShim();
    const plugin = modules.get('spfx-fast-serve-loader:hello-web-part')?.factory() as {
      load(name: string, req: unknown, onload: { (v: unknown): void; error(e: unknown): void }): void;
    };
    const scopedRequire = vi.fn<() => void>();
    const onload = Object.assign(vi.fn<(value: unknown) => void>(), { error: vi.fn<(error: unknown) => void>() });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    plugin.load('/@spfx/entry/hello-web-part', scopedRequire, onload);

    expect(window.scopedRequire).toBe(scopedRequire);
    await vi.waitFor(() => {
      expect(onload.error).toHaveBeenCalled();
    });
    const error = onload.error.mock.calls[0]?.[0] as Error;
    expect(error.message).toMatch(/^\[fast-serve\] Failed to load bundle "hello-web-part" from https:\/\/localhost:4321: /);

    page.mutate();
    expect(page.queriedSelectors).toEqual(['[data-sp-web-part-id="abc"] [data-automation-id="webPartError"]']);
    expect(page.errorText.nodeValue).toBe(`ERROR:${error.message}`);
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

describe('renderBundleEntry with several components', () => {
  it('re-exports each component under its export name and keeps the reload fallback', () => {
    expect(renderBundleEntry('/p', sharedBundle).split('\n')).toEqual([
      "import '@vitejs/plugin-react/preamble';",
      'export * as a from "/src/webparts/first/FirstWebPart.ts";',
      'export * as b from "/src/webparts/second/SecondWebPart.ts";',
      'if (import.meta.hot) import.meta.hot.accept(() => location.reload());',
      '',
    ]);
  });
});
