import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { rspack } from '@rspack/core';
import { clearCachesEntrySource, isTunnelServePlugin, resolveTunnel, TunnelServePlugin } from './index.js';

type ClearTunnelCaches = (host: string) => void;

function loadClearCachesRuntime(globals: Record<string, unknown>): ClearTunnelCaches {
  const file = fileURLToPath(new URL('runtime/clearCaches.ts', import.meta.url));
  const { code } = rspack.experiments.swc.transformSync(readFileSync(file, 'utf8'), { filename: file, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' }, module: { type: 'commonjs' } });
  const exports: { clearTunnelCaches?: ClearTunnelCaches } = {};
  const sandbox: Record<string, unknown> = { ...globals, exports };
  sandbox.window = sandbox;
  vm.runInNewContext(code, sandbox);
  if (exports.clearTunnelCaches === undefined) throw new Error('the runtime does not export clearTunnelCaches');
  return exports.clearTunnelCaches;
}

const definePlugin = new rspack.DefinePlugin({ CONTOSO: '1' });

describe('TunnelServePlugin', () => {
  it('is recognised by its global symbol, also when another copy of the package created it', () => {
    expect(isTunnelServePlugin(new TunnelServePlugin({ host: 'dev.contoso.example' }))).toBe(true);
    const otherCopy = vm.runInNewContext("({ [Symbol.for('spfx-fast-serve.tunnel-serve-plugin')]: true, options: { host: 'dev.contoso.example' }, apply() {} })") as unknown;
    expect(isTunnelServePlugin(otherCopy)).toBe(true);
    expect(isTunnelServePlugin(definePlugin)).toBe(false);
    expect(isTunnelServePlugin(undefined)).toBe(false);
  });
});

describe('resolveTunnel', () => {
  it('takes the host from the plugin and removes the plugin from the Rspack config', () => {
    const resolved = resolveTunnel({ plugins: [definePlugin, new TunnelServePlugin({ host: ' Dev.Contoso.Example ' })] });
    expect(resolved).toEqual({ config: { plugins: [definePlugin] }, host: 'dev.contoso.example', warnings: [] });
  });

  it('leaves configs without the plugin unchanged', () => {
    const config = { plugins: [definePlugin] };
    expect(resolveTunnel(config)).toEqual({ config, host: undefined, warnings: [] });
    expect(resolveTunnel({})).toEqual({ config: {}, host: undefined, warnings: [] });
  });

  it('ignores hosts with a scheme, port or path and warns', () => {
    for (const host of ['https://dev.contoso.example', 'dev.contoso.example:443', 'dev.contoso.example/dist', 'dev contoso', '']) {
      const resolved = resolveTunnel({ plugins: [new TunnelServePlugin({ host })] });
      expect(resolved.host).toBeUndefined();
      expect(resolved.config.plugins).toEqual([]);
      expect(resolved.warnings).toEqual([expect.stringMatching(/^TunnelServePlugin .*; tunnel mode is off$/)]);
    }
    expect(resolveTunnel({ plugins: [new TunnelServePlugin({} as { host: string })] }).warnings[0]).toContain('needs "host"');
  });

  it('uses the first of several plugins and warns', () => {
    const resolved = resolveTunnel({ plugins: [new TunnelServePlugin({ host: 'one.contoso.example' }), new TunnelServePlugin({ host: 'two.contoso.example' })] });
    expect(resolved.host).toBe('one.contoso.example');
    expect(resolved.warnings).toEqual(['several TunnelServePlugin instances, using the first one']);
  });
});

interface FakeRequest {
  url: string;
}

function fakeCaches(entries: Record<string, string[]>): { caches: unknown; remaining: () => Record<string, string[]> } {
  const stores = new Map(Object.entries(entries).map(([name, urls]) => [name, urls.map((url): FakeRequest => ({ url }))]));
  const caches = {
    keys: () => Promise.resolve([...stores.keys()]),
    open: (name: string) =>
      Promise.resolve({
        keys: () => Promise.resolve([...(stores.get(name) ?? [])]),
        delete: (request: FakeRequest) => {
          stores.set(name, (stores.get(name) ?? []).filter((stored) => stored !== request));
          return Promise.resolve(true);
        },
      }),
  };
  return { caches, remaining: () => Object.fromEntries(stores) as unknown as Record<string, string[]> };
}

describe('clearTunnelCaches', () => {
  it('does nothing without Cache Storage', () => {
    expect(() => {
      loadClearCachesRuntime({})('dev.contoso.example');
    }).not.toThrow();
  });

  it('removes the tunnel responses from the SharePoint site caches only', async () => {
    const { caches, remaining } = fakeCaches({
      'Site-contoso': ['https://dev.contoso.example/dist/hello.js', 'https://res.cdn.office.net/sp.js'],
      'Other-cache': ['https://dev.contoso.example/dist/hello.js'],
    });
    const info: unknown[] = [];
    const clearTunnelCaches = loadClearCachesRuntime({ caches, console: { info: (...args: unknown[]) => info.push(args.join(' ')) } });
    clearTunnelCaches('dev.contoso.example');
    await delay(20);
    expect(remaining()).toEqual({ 'Site-contoso': [{ url: 'https://res.cdn.office.net/sp.js' }], 'Other-cache': [{ url: 'https://dev.contoso.example/dist/hello.js' }] });
    expect(info).toEqual(['[fast-serve] removed 1 cached response(s) from dev.contoso.example (SharePoint mobile cache)']);
  });

  it('is an entry module that passes the tunnel host to the runtime', () => {
    expect(clearCachesEntrySource('dev.contoso.example')).toMatch(/^import \{ clearTunnelCaches \} from ".+\/runtime\/clearCaches\.(?:ts|js)";\nclearTunnelCaches\("dev\.contoso\.example"\);\n$/);
  });
});
