import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { BROWSER_ERRORS_ID, BROWSER_ERRORS_URL } from '../browserErrors/index.js';
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
  const visibilityListeners: (() => void)[] = [];
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
      visibilityState: 'visible',
      addEventListener: (type: string, listener: () => void) => {
        if (type === 'visibilitychange') visibilityListeners.push(listener);
      },
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
  const becomeVisible = () => {
    for (const listener of visibilityListeners) listener();
  };
  return { globals, errorText, queriedSelectors, mutate: () => onMutation?.(), becomeVisible };
}

type Factory = (...modules: unknown[]) => unknown;
const prelude = 'window.__spfxFastServe = { useScopedRequire: function (req) { window.scopedRequire = req; } };';

async function evaluateShim(shimBundle: SpfxBundle = bundle, extraGlobals: Record<string, unknown> = {}, importError?: Error) {
  const code = await renderShim(createShimConfig(shimBundle, 'https://localhost:4321'), prelude);
  const modules = new Map<string, { deps: string[]; factory: Factory }>();
  const define = (id: string, deps: string[], factory: Factory) => modules.set(id, { deps, factory });
  const window: { scopedRequire?: unknown } = {};
  const page = fakeSharePointPage();
  const importedUrls: string[] = [];
  const importModule = (url: string) => {
    importedUrls.push(url);
    if (url.endsWith(BROWSER_ERRORS_URL)) return Promise.resolve({});
    return Promise.reject(importError ?? new Error('no module loader in tests'));
  };
  runInNewContext(code.replaceAll('import(shimConfig.origin', 'importModule(shimConfig.origin'), {
    define,
    window,
    console,
    Promise,
    URL,
    Error,
    String,
    Object,
    setTimeout,
    importModule,
    ...page.globals,
    ...extraGlobals,
  });
  return { code, modules, window, page, importedUrls };
}

interface LoaderPlugin {
  load(name: string, req: unknown, onload: { (v: unknown): void; error(e: unknown): void }): void;
}

async function failingLoad(extraGlobals: Record<string, unknown>, importError: Error) {
  const { modules, page, importedUrls } = await evaluateShim(bundle, extraGlobals, importError);
  const plugin = modules.get('spfx-fast-serve-loader:hello-web-part')?.factory() as LoaderPlugin | undefined;
  if (!plugin) throw new Error('loader plugin not defined');
  const onload = Object.assign(vi.fn<(value: unknown) => void>(), { error: vi.fn<(error: unknown) => void>() });
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  plugin.load('/@spfx/entry/hello-web-part', vi.fn<() => void>(), onload);
  await vi.waitFor(() => {
    expect(onload.error).toHaveBeenCalled();
  });
  const [failure] = onload.error.mock.calls[0] ?? [];
  return { message: failure instanceof Error ? failure.message : String(failure), failure, page, importedUrls };
}

describe('renderShim', () => {
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

function statusResponses(...statuses: object[]) {
  const queue = [...statuses];
  return vi.fn<(url: string) => Promise<unknown>>(() => {
    const status = queue.length > 1 ? queue.shift() : queue[0];
    return Promise.resolve({ ok: true, json: () => Promise.resolve(status) });
  });
}

describe('bundle load failures', () => {
  const fetchFailure = new TypeError('Failed to fetch dynamically imported module: https://localhost:4321/@spfx/entry/hello-web-part');

  it('shows the compile error recorded by the server and reloads after the next file change', async () => {
    const fetch = statusResponses(
      { error: { message: '[PARSE_ERROR] Unexpected token', location: 'src/a.tsx:15:18' }, fileRevision: 3 },
      { error: null, fileRevision: 3 },
      { error: null, fileRevision: 4 },
    );
    const location = { reload: vi.fn<() => void>() };
    vi.useFakeTimers({ toFake: ['setTimeout'] });
    try {
      const { message, failure } = await failingLoad({ fetch, location, setTimeout, Symbol }, fetchFailure);
      const reportedInTerminal = (failure as Record<symbol, unknown>)[Symbol.for('fast-serve.reported-in-terminal')];
      expect(message).toBe(
        '[fast-serve] Failed to load bundle "hello-web-part" from https://localhost:4321: [PARSE_ERROR] Unexpected token in src/a.tsx:15:18. ' +
          'See the fast-serve terminal for details (the page reloads after the next file change)',
      );
      expect(fetch).toHaveBeenCalledWith('https://localhost:4321/@spfx/status', { cache: 'no-store' });
      expect(reportedInTerminal).toBe(true);
      await vi.advanceTimersByTimeAsync(1000);
      expect(location.reload).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(location.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('backs off while the dev server is unreachable and reloads once it is back', async () => {
    const reachable = { error: null, fileRevision: 3 };
    let serverUp = true;
    const fetch = vi.fn<() => Promise<unknown>>(() =>
      serverUp ? Promise.resolve({ ok: true, json: () => Promise.resolve(reachable) }) : Promise.reject(new TypeError('Failed to fetch')),
    );
    const location = { reload: vi.fn<() => void>() };
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      await failingLoad({ fetch, location, setTimeout, Date, console }, fetchFailure);
      serverUp = false;
      await vi.advanceTimersByTimeAsync(1000);
      const callsWhenServerStopped = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(2000 + 4000 + 8000);
      expect(fetch.mock.calls.length - callsWhenServerStopped).toBe(3);
      await vi.advanceTimersByTimeAsync(5 * 60_000);
      expect(fetch.mock.calls.length - callsWhenServerStopped).toBeLessThan(20);
      expect(location.reload).not.toHaveBeenCalled();
      serverUp = true;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(location.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops polling after the server stays unreachable and resumes when the tab becomes visible', async () => {
    let serverUp = true;
    const fetch = vi.fn<() => Promise<unknown>>(() =>
      serverUp ? Promise.resolve({ ok: true, json: () => Promise.resolve({ error: null, fileRevision: 1 }) }) : Promise.reject(new TypeError('Failed to fetch')),
    );
    const location = { reload: vi.fn<() => void>() };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ['setTimeout', 'Date'] });
    try {
      const { page } = await failingLoad({ fetch, location, setTimeout, Date, console }, fetchFailure);
      serverUp = false;
      await vi.advanceTimersByTimeAsync(11 * 60_000);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining('stopped waiting for file changes'));
      const callsWhenStopped = fetch.mock.calls.length;
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(fetch.mock.calls.length).toBe(callsWhenStopped);
      serverUp = true;
      page.becomeVisible();
      await vi.advanceTimersByTimeAsync(0);
      expect(location.reload).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
      warn.mockRestore();
    }
  });

  it('points to the terminal when the dev server is not reachable', async () => {
    const fetch = vi.fn<() => Promise<unknown>>(() => Promise.reject(new TypeError('Failed to fetch')));
    const { message } = await failingLoad({ fetch }, fetchFailure);
    expect(message).toContain('Failed to fetch dynamically imported module');
    expect(message).toContain('check the fast-serve terminal');
    expect(message).not.toContain('reloads');
  });

  it('explains a missing export as a TypeScript-only name and loads the error forwarding first', async () => {
    const fetch = vi.fn<() => Promise<unknown>>(() => Promise.reject(new TypeError('Failed to fetch')));
    const linkError = new SyntaxError(
      "The requested module '/node_modules/.vite/deps/@fluentui_font-icons-mdl2.js?v=1' does not provide an export named 'IconNames'",
    );
    const { message, importedUrls, failure } = await failingLoad({ fetch, Symbol }, linkError);
    expect(Object.getOwnPropertySymbols(failure)).toEqual([]);
    expect(message).toContain("does not provide an export named 'IconNames'. \"IconNames\" has no runtime value in that module");
    expect(message).toContain('`import type { IconNames }`');
    expect(message).toContain('`const enum` from a dependency');
    expect(importedUrls).toEqual([`https://localhost:4321${BROWSER_ERRORS_URL}`, 'https://localhost:4321/@spfx/entry/hello-web-part']);
  });
});

function rejectedFetch() {
  return vi.fn<() => Promise<unknown>>(() => Promise.reject(new TypeError('Failed to fetch')));
}

describe('missing export hints', () => {
  it('blames the config.json external when the missing export comes from its facade', async () => {
    const linkError = new SyntaxError("The requested module '/@id/__x00__spfx-external:ejs' does not provide an export named 'render'");
    const { message } = await failingLoad({ fetch: rejectedFetch() }, linkError);
    expect(message).toContain('"render" is not provided by the config/config.json external "ejs" (the loaded script doesn\'t define that property)');
    expect(message).toContain('https://github.com/s-KaiNet/spfx-fast-serve-helpers#configjson-externals');
    expect(message).not.toContain('import type');
  });

  it('names scoped externals behind the CommonJS facade', async () => {
    const linkError = new SyntaxError(
      "The requested module 'https://localhost:4321/@id/__x00__spfx-external-cjs:@scope/charts?v=2' does not provide an export named 'Chart'",
    );
    const { message } = await failingLoad({ fetch: rejectedFetch() }, linkError);
    expect(message).toContain('"Chart" is not provided by the config/config.json external "@scope/charts"');
  });

  it('keeps the TypeScript hint for SPFx libraries', async () => {
    const linkError = new SyntaxError("The requested module '/@id/__x00__spfx-library:@microsoft/sp-core-library' does not provide an export named 'IFoo'");
    const { message } = await failingLoad({ fetch: rejectedFetch() }, linkError);
    expect(message).toContain('"IFoo" has no runtime value in that module');
    expect(message).not.toContain('config/config.json external');
  });

  it('keeps the TypeScript hint for Firefox, whose message has no module URL', async () => {
    const { message } = await failingLoad({ fetch: rejectedFetch() }, new SyntaxError('import not found: render'));
    expect(message).toContain('"render" has no runtime value in that module');
    expect(message).toContain('`import type { render }`');
  });
});

describe('renderBundleEntry', () => {
  it('imports the browser error forwarding and the Fast Refresh preamble first and reloads on unaccepted updates', () => {
    const code = renderBundleEntry('/p', bundle);
    expect(code.split('\n').slice(0, 2)).toEqual([`import ${JSON.stringify(BROWSER_ERRORS_ID)};`, "import '@vitejs/plugin-react/preamble';"]);
    expect(code).toContain('export * from "/src/webparts/hello/HelloWebPart.ts";');
    expect(code).toContain('export { default } from "/src/webparts/hello/HelloWebPart.ts";');
    expect(code).toContain('import.meta.hot.accept(() => location.reload())');
  });
});

describe('renderBundleEntry with several components', () => {
  it('re-exports each component under its export name and keeps the reload fallback', () => {
    expect(renderBundleEntry('/p', sharedBundle).split('\n')).toEqual([
      `import ${JSON.stringify(BROWSER_ERRORS_ID)};`,
      "import '@vitejs/plugin-react/preamble';",
      'export * as a from "/src/webparts/first/FirstWebPart.ts";',
      'export * as b from "/src/webparts/second/SecondWebPart.ts";',
      'if (import.meta.hot) import.meta.hot.accept(() => location.reload());',
      '',
    ]);
  });
});
