import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import { rolldown } from 'rolldown';
import { createServer, type Plugin, type Rolldown, type UserConfig, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ServeContext } from '../context.js';
import { amdIsolationFilter, dependencyPackageName, hideAmdDefine, isolateAmdPlugin, prebundlePluginName } from './isolateAmd.js';

const AMD_FIRST_UMD = `;(function () {
  var lib = { hello: function () { return 'hello from amd-first-umd'; } };
  var freeModule = typeof module == 'object' && module && !module.nodeType && module;
  if (typeof define == 'function' && typeof define.amd == 'object' && define.amd) {
    define(function () { return lib; });
  } else if (freeModule) {
    freeModule.exports = lib;
  } else {
    this.amdFirstUmd = lib;
  }
}.call(this));
`;

const COMMONJS_FIRST_UMD = `!function (root, factory) {
  typeof exports == 'object' && typeof module != 'undefined' ? module.exports = factory()
    : typeof define == 'function' && define.amd ? define(factory) : (root.cjsFirst = factory());
}(this, function () { return { kind: 'cjs-first' }; });
`;

const LOCAL_DEFINE = `function define(factory) { module.exports = { local: factory() }; }
define.amd = {};
if (typeof define == 'function' && define.amd) define(function () { return 'own define'; });
`;

const CONST_DEFINE = `const define = (factory) => { module.exports = { local: factory() }; };
if (typeof define == 'function') define(function () { return 'const define'; });
module.exports.amd = 'no global';
`;

const MEMBER_DEFINE = `var registry = { define: function (value) { return value; } };
module.exports = { value: registry.define('member'), amd: 'mentioned' };
`;

interface AmdGlobal {
  define?: ((...args: unknown[]) => void) & { amd?: object };
}

const host = globalThis as AmdGlobal;

function pageDefine() {
  return Object.assign(vi.fn(), { amd: {} });
}

function installPageDefine() {
  const define = pageDefine();
  host.define = define;
  return define;
}

function runCommonJs(code: string, define: AmdGlobal['define']): unknown {
  const module = { exports: {} as unknown };
  runInNewContext(code, { module, exports: module.exports, define });
  return module.exports;
}

async function isolated(code: string, id = '/project/node_modules/pkg/index.js'): Promise<string> {
  return (await hideAmdDefine(code, id))?.code ?? code;
}

afterEach(() => {
  delete host.define;
});

describe('hideAmdDefine', () => {
  it('makes an AMD-first UMD take its CommonJS branch without calling the page define', async () => {
    const unisolatedDefine = pageDefine();
    expect(runCommonJs(AMD_FIRST_UMD, unisolatedDefine)).toEqual({});
    expect(unisolatedDefine).toHaveBeenCalledTimes(1);

    const spy = pageDefine();
    const exported = runCommonJs(await isolated(AMD_FIRST_UMD), spy) as { hello: () => string };
    expect(exported.hello()).toBe('hello from amd-first-umd');
    expect(spy).not.toHaveBeenCalled();
  });

  it('keeps CommonJS-first UMD bundles working', async () => {
    const spy = pageDefine();
    expect(runCommonJs(await isolated(COMMONJS_FIRST_UMD), spy)).toEqual({ kind: 'cjs-first' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('leaves a dependency that declares its own define alone', async () => {
    const spy = pageDefine();
    expect(runCommonJs(await isolated(LOCAL_DEFINE), spy)).toEqual({ local: 'own define' });
    expect(runCommonJs(await isolated(CONST_DEFINE), spy)).toEqual({ local: 'const define', amd: 'no global' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('replaces only the global identifier, not properties named define', async () => {
    const code = await isolated(MEMBER_DEFINE);
    expect(code).toContain('registry.define(');
    expect(runCommonJs(code, pageDefine())).toEqual({ value: 'member', amd: 'mentioned' });
  });

  it('skips code without AMD detection', async () => {
    expect(await hideAmdDefine('define(function () { return 1; });', '/p/node_modules/amd-only/index.js')).toBeNull();
  });
});

describe('amdIsolationFilter', () => {
  it('reads the package name from the last node_modules segment', () => {
    expect(dependencyPackageName('/p/node_modules/lodash/lodash.js?v=1')).toBe('lodash');
    expect(dependencyPackageName('C:\\p\\node_modules\\@scope\\pkg\\dist\\index.js')).toBe('@scope/pkg');
    expect(dependencyPackageName('/p/node_modules/.pnpm/a@1/node_modules/@scope/pkg/index.js')).toBe('@scope/pkg');
    expect(dependencyPackageName('/p/src/index.js')).toBeUndefined();
  });

  it('names the pre-bundle plugin after the opt-outs, so Vite re-optimizes dependencies when they change', () => {
    expect(prebundlePluginName([])).toBe('fast-serve:isolate-amd-prebundle');
    expect(prebundlePluginName(['b', 'a', 'b'])).toBe('fast-serve:isolate-amd-prebundle(keeps a, b)');
  });

  it('keeps define for opted-out packages', () => {
    const hidesAmdDefine = amdIsolationFilter(['legacy-amd', '@scope/amd']);
    expect(hidesAmdDefine('/p/node_modules/legacy-amd/index.js')).toBe(false);
    expect(hidesAmdDefine('/p/node_modules/@scope/amd/index.js')).toBe(false);
    expect(hidesAmdDefine('/p/node_modules/lodash/lodash.js')).toBe(true);
    expect(hidesAmdDefine('/p/repro/linked/index.js')).toBe(true);
  });
});

function fixtureOptions(amdPackages: string[] = []): Pick<ServeContext, 'options'> {
  return { options: { amdPackages } as unknown as ServeContext['options'] };
}

function prebundlePlugin(plugin: Plugin): Rolldown.Plugin {
  const config = (plugin.config as () => UserConfig)();
  const [prebundle] = (config.optimizeDeps?.rolldownOptions?.plugins ?? []) as Rolldown.Plugin[];
  if (!prebundle) throw new Error('no pre-bundle plugin');
  return prebundle;
}

describe('isolateAmdPlugin', () => {
  let projectRoot: string | undefined;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = undefined;
  });

  function writeProject(files: Record<string, string>): string {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-amd-'));
    for (const [file, content] of Object.entries(files)) {
      mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
      writeFileSync(path.join(projectRoot, file), content);
    }
    return projectRoot;
  }

  async function prebundle(amdPackages: string[] = []): Promise<{ lib: { hello?: () => string } }> {
    const root = writeProject({
      'node_modules/amd-first-umd/package.json': '{ "name": "amd-first-umd", "version": "1.0.0", "main": "index.js" }',
      'node_modules/amd-first-umd/index.js': AMD_FIRST_UMD,
      'entry.js': "import lib from 'amd-first-umd';\nexport { lib };\n",
    });
    const bundle = await rolldown({ input: path.join(root, 'entry.js'), cwd: root, logLevel: 'silent', plugins: [prebundlePlugin(isolateAmdPlugin(fixtureOptions(amdPackages)))] });
    const outFile = path.join(root, 'out.mjs');
    try {
      await bundle.write({ file: outFile, format: 'esm' });
    } finally {
      await bundle.close();
    }
    return (await import(pathToFileURL(outFile).href)) as { lib: { hello?: () => string } };
  }

  it('isolates pre-bundled dependencies from the page define', async () => {
    const spy = installPageDefine();
    const { lib } = await prebundle();
    expect(lib.hello?.()).toBe('hello from amd-first-umd');
    expect(spy).not.toHaveBeenCalled();
  });

  it('lets opted-out packages register with the page RequireJS', async () => {
    const spy = installPageDefine();
    const { lib } = await prebundle(['amd-first-umd']);
    expect(lib).toEqual({});
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('transforms dependencies served from node_modules but not project files or optimized deps', async () => {
    const root = writeProject({
      'node_modules/esm-umd/index.js': "export const kind = typeof define == 'function' && define.amd ? 'amd' : 'esm';\n",
      'node_modules/legacy-amd/index.js': "export const kind = typeof define == 'function' && define.amd ? 'amd' : 'esm';\n",
      'node_modules/.vite/deps/bundled.js': "export const kind = typeof define == 'function' && define.amd ? 'amd' : 'esm';\n",
      'src/amd.js': "export const kind = typeof define == 'function' && define.amd ? 'amd' : 'esm';\n",
    });
    server = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      server: { middlewareMode: true, ws: false },
      optimizeDeps: { noDiscovery: true },
      plugins: [isolateAmdPlugin(fixtureOptions(['legacy-amd']))],
    });
    const client = server.environments.client;
    expect((await client.transformRequest('/node_modules/esm-umd/index.js'))?.code).toContain('typeof undefined');
    expect((await client.transformRequest('/node_modules/legacy-amd/index.js'))?.code).toContain('typeof define');
    expect((await client.transformRequest('/node_modules/.vite/deps/bundled.js'))?.code).toContain('typeof define');
    expect((await client.transformRequest('/src/amd.js'))?.code).toContain('typeof define');
  });
});
