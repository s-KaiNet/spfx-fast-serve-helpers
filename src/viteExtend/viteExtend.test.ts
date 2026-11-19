import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { ResolvedConfig } from 'vite';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { defineConfig } from '../index.js';
import { resolveOptions } from '../config/options.js';
import { publishFastServeContext, type FastServeContext } from './context.js';
import { findViteExtendFile, isViteExtendCandidate } from './files.js';
import { changedByPlugins, protectedKeysIn } from './guard.js';
import { webpackCustomizationHint } from './webpackHint.js';

const CONTEXT_KEY = Symbol.for('spfx-fast-serve-helpers.context');

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-vite-extend-'));
  createdRoots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

const sampleContext: FastServeContext = {
  root: '/project',
  port: 4400,
  origin: 'https://localhost:4400',
  locale: 'en-us',
  serveConfiguration: 'default',
  pageUrl: 'https://contoso.sharepoint.com/sites/dev/SitePages/a.aspx',
  spfxVersion: '1.24.1',
  fastServeVersion: '1.24.0',
  viteVersion: '8.3.8',
};

const env = { command: 'serve', mode: 'development' } as const;

describe('findViteExtendFile', () => {
  it('prefers .mts and accepts .ts, .mjs, .js and .cjs in the fast-serve folder', () => {
    const root = projectWith({ 'fast-serve/vite.extend.js': '', 'fast-serve/vite.extend.mts': '' });
    expect(findViteExtendFile(root)).toBe(path.join(root, 'fast-serve/vite.extend.mts'));
    for (const extension of ['.ts', '.mjs', '.js', '.cjs']) {
      const single = projectWith({ [`fast-serve/vite.extend${extension}`]: '' });
      expect(findViteExtendFile(single)).toBe(path.join(single, `fast-serve/vite.extend${extension}`));
    }
  });

  it('ignores other names and locations', () => {
    const root = projectWith({ 'config/vite.extend.mts': '', 'fast-serve/vite.config.mts': '', 'vite.extend.mts': '' });
    expect(findViteExtendFile(root)).toBeUndefined();
    expect(isViteExtendCandidate(root, path.join(root, 'fast-serve/vite.extend.cjs'))).toBe(true);
    expect(isViteExtendCandidate(root, path.join(root, 'config/vite.extend.mts'))).toBe(false);
  });
});

describe('defineConfig', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, CONTEXT_KEY);
  });

  it('passes plain and promised configs through', async () => {
    const config = { define: { A: '1' } };
    expect(defineConfig(config)).toBe(config);
    expect(await defineConfig(Promise.resolve(config))).toBe(config);
  });

  it('calls a function with the fast-serve context and the Vite env', async () => {
    publishFastServeContext(sampleContext);
    const config = defineConfig((context, viteEnv) => ({ define: { PORT: String(context.port), MODE: JSON.stringify(viteEnv.mode) } }));
    expect(await config(env)).toEqual({ define: { PORT: '4400', MODE: '"development"' } });
  });

  it('supports async functions and freezes the context', async () => {
    publishFastServeContext(sampleContext);
    const config = defineConfig(async (context) => {
      await Promise.resolve();
      expect(Object.isFrozen(context)).toBe(true);
      return { base: context.origin };
    });
    expect(await config(env)).toEqual({ base: 'https://localhost:4400' });
  });

  it('explains that the file only works inside fast-serve', () => {
    const config = defineConfig(() => ({}));
    expect(() => config(env)).toThrow('fast-serve/vite.extend.mts is loaded by the fast-serve command only.');
  });
});

describe('protectedKeysIn', () => {
  it('finds keys that fast-serve owns', () => {
    const keys = protectedKeysIn(
      {
        root: '/elsewhere',
        base: '/x/',
        server: { port: 5555, origin: 'https://localhost:5555', https: {}, hmr: { overlay: false }, proxy: { '/api': 'https://api' } },
        css: { modules: { localsConvention: 'dashes' } },
        define: { DEBUG: 'false', 'process.env.NODE_ENV': '"production"', MY_CONSTANT: '1' },
        build: { outDir: 'dist' },
      },
      '/project',
    ).map(({ key }) => key);
    expect(keys).toEqual(['root', 'base', 'server.port', 'server.origin', 'server.hmr.overlay', 'css.modules', 'define.DEBUG', 'define["process.env.NODE_ENV"]', 'build']);
  });

  it('accepts the expected customizations and empty objects Vite adds', () => {
    expect(
      protectedKeysIn(
        {
          root: '/project',
          define: { MY_CONSTANT: '1' },
          resolve: { alias: { '@src': '/project/src' } },
          server: { proxy: {}, headers: { 'X-A': '1' } },
          build: { rolldownOptions: undefined },
          plugins: [],
        },
        '/project',
      ),
    ).toEqual([]);
  });

  it('points to the fast-serve option for the port', () => {
    expect(protectedKeysIn({ server: { port: 5555 } }, '/project')[0]?.alternative).toBe('use --port or "port" in fast-serve/config.json');
  });
});

const resolved = (overrides: { port?: number; origin?: string; https?: object | undefined; appType?: string; base?: string }) =>
  ({
    appType: overrides.appType ?? 'custom',
    base: overrides.base ?? '/',
    server: { port: overrides.port ?? 4400, origin: overrides.origin ?? 'https://localhost:4400', https: 'https' in overrides ? overrides.https : {} },
  }) as unknown as ResolvedConfig;

describe('changedByPlugins', () => {
  const options = resolveOptions({ cli: { port: 4400 } }, {});
  it('is silent when fast-serve settings survive', () => {
    expect(changedByPlugins(resolved({}), { options })).toEqual([]);
  });

  it('reports overridden port, origin, appType, base and a removed https', () => {
    expect(changedByPlugins(resolved({ port: 5555, origin: 'https://localhost:9999', appType: 'spa', base: '/x/', https: undefined }), { options })).toEqual([
      '"server.port" is 5555, fast-serve needs 4400 (use --port or "port" in fast-serve/config.json)',
      '"server.origin" is "https://localhost:9999", fast-serve needs "https://localhost:4400" (use --port or "port" in fast-serve/config.json)',
      '"appType" is "spa", fast-serve needs "custom" (fast-serve serves no index.html)',
      '"base" is "/x/", fast-serve needs "/" (manifests and shims use absolute URLs from the origin)',
      '"server.https" was removed, SharePoint pages load the components only over HTTPS',
    ]);
  });
});

describe('webpackCustomizationHint', () => {
  const packageRoot = '/opt/fast-serve';

  it('names config/spfx-customize-webpack.js and shows how to add the Vite config', () => {
    const hint = webpackCustomizationHint(projectWith({ 'config/spfx-customize-webpack.js': 'module.exports = {};' }), packageRoot);
    expect(hint[0]).toBe("hint: this project customizes heft's webpack config (config/spfx-customize-webpack.js), but fast-serve doesn't run webpack.");
    const text = hint.join('\n');
    expect(text).toContain('fast-serve/vite.extend.mts');
    expect(text).toContain("import { defineConfig } from 'spfx-fast-serve-helpers';");
    expect(text).toContain('#customizing-the-vite-config');
    expect(text).toContain('coding agents: /opt/fast-serve/skills/fast-serve-vite-config/SKILL.md');
    expect(text).toContain('AGENTS.md');
  });

  it('lists config/webpack-patch.json with its existing patch files', () => {
    const root = projectWith({
      'config/webpack-patch.json': '{ "$schema": "x", // patches\n "patchFiles": ["./config/webpack-patch/contoso.js", "./config/webpack-patch/missing.js"] }',
      'config/webpack-patch/contoso.js': 'module.exports = (config) => config;',
    });
    expect(webpackCustomizationHint(root, packageRoot)[0]).toContain('(config/webpack-patch.json, config/webpack-patch/contoso.js)');
  });

  it('points to the skill inside the project node_modules when installed there', () => {
    const root = projectWith({
      'config/spfx-customize-webpack.js': '',
      'node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md': '# skill',
    });
    expect(webpackCustomizationHint(root, packageRoot).join('\n')).toContain('coding agents: node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md');
  });

  it('is silent without a webpack customization', () => {
    expect(webpackCustomizationHint(projectWith({ 'config/config.json': '{}' }), packageRoot)).toEqual([]);
  });
});
