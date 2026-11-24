import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { DevServer } from '@rspack/core';
import { afterAll, describe, expect, it } from 'vitest';
import { defineConfig, rspack } from '../../index.js';
import { resolveOptions } from '../../config/options.js';
import { findExtendFile, findExtendFiles } from './files.js';
import { guardExtendConfig } from './guard.js';
import { fastServeContext } from './index.js';
import { mergeDevServer, mergeRspackConfig } from './merge.js';
import { withModulePaths } from './sourceDirLoader.js';
import { webpackCustomizationHint } from './webpackHint.js';

const createdRoots: string[] = [];

afterAll(() => {
  for (const root of createdRoots) rmSync(root, { recursive: true, force: true });
});

function projectWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-rspack-extend-'));
  createdRoots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('findExtendFile', () => {
  it('prefers .mjs, then .mts, .js, .ts, .cjs and .cts in the fast-serve folder', () => {
    const root = projectWith({ 'fast-serve/rspack.extend.cjs': '', 'fast-serve/rspack.extend.mts': '', 'fast-serve/rspack.extend.mjs': '' });
    expect(findExtendFiles(root).map((file) => path.basename(file))).toEqual(['rspack.extend.mjs', 'rspack.extend.mts', 'rspack.extend.cjs']);
    for (const extension of ['.mts', '.js', '.ts', '.cjs', '.cts']) {
      const single = projectWith({ [`fast-serve/rspack.extend${extension}`]: '' });
      expect(findExtendFile(single)).toBe(path.join(single, `fast-serve/rspack.extend${extension}`));
    }
  });

  it('ignores other names and locations', () => {
    const root = projectWith({ 'config/rspack.extend.mjs': '', 'fast-serve/vite.extend.mts': '', 'fast-serve/webpack.extend.js': '', 'rspack.extend.mjs': '' });
    expect(findExtendFile(root)).toBeUndefined();
  });
});

describe('defineConfig', () => {
  it('returns its argument, so a function is called by fast-serve with the context and env', () => {
    const config = { resolve: { alias: { '@src': '/project/src' } } };
    expect(defineConfig(config)).toBe(config);
    const factory = defineConfig(({ port }, env) => ({ name: `${port} ${env.mode}` }));
    expect(factory(fastServeContext('/project', resolveOptions({ cli: { port: 4400 } }, {}), { kind: 'installed', version: '1.23.2', packageName: '@microsoft/sp-core-library' }), { command: 'serve', mode: 'development' })).toEqual({
      name: '4400 development',
    });
  });

  it('re-exports the rspack namespace', () => {
    expect(typeof rspack.DefinePlugin).toBe('function');
  });
});

describe('fastServeContext', () => {
  it('describes the server for the config function and is frozen', () => {
    const options = resolveOptions({ cli: { port: 4400, locale: 'de-de', pageUrl: 'https://contoso.sharepoint.com/sites/dev' } }, {});
    const context = fastServeContext('/project', options, { kind: 'installed', version: '1.23.2', packageName: '@microsoft/sp-core-library' });
    expect(context).toMatchObject({
      root: '/project',
      port: 4400,
      origin: 'https://localhost:4400',
      publicPath: 'https://localhost:4400/dist/',
      locale: 'de-de',
      serveConfiguration: undefined,
      pageUrl: 'https://contoso.sharepoint.com/sites/dev',
      spfxVersion: '1.23.2',
    });
    expect(context.rspackVersion).toMatch(/^2\./);
    expect(context.fastServeVersion).toMatch(/^1\.23\./);
    expect(Object.isFrozen(context)).toBe(true);
  });
});

describe('guardExtendConfig', () => {
  it('ignores keys fast-serve owns and names the option to use instead', () => {
    const guarded = guardExtendConfig({
      entry: './src/index.ts',
      mode: 'production',
      target: 'node',
      externalsType: 'var',
      output: { publicPath: 'https://localhost:5555/', library: { type: 'umd' } },
      devServer: { port: 5555, server: 'http', client: { overlay: false }, proxy: [{ context: ['/api'], target: 'https://api.contoso.com' }] },
      resolve: { alias: { '@src': '/project/src' } },
    });
    expect(guarded.ignored.map(({ key }) => key)).toEqual(['entry', 'mode', 'target', 'externalsType', 'output.publicPath', 'output.library', 'devServer.port', 'devServer.server', 'devServer.client']);
    expect(guarded.ignored.find(({ key }) => key === 'devServer.port')?.alternative).toBe('use --port or "port" in fast-serve/config.json');
    expect(guarded.ignored.find(({ key }) => key === 'output.publicPath')?.alternative).toContain('use --port or "port" in fast-serve/config.json; to serve through a tunnel add new TunnelServePlugin({ host })');
    expect(guarded.ignored.find(({ key }) => key === 'devServer.client')?.alternative).toContain('--no-overlay');
    expect(guarded.config).toEqual({ resolve: { alias: { '@src': '/project/src' } } });
    expect(guarded.devServer).toEqual({ proxy: [{ context: ['/api'], target: 'https://api.contoso.com' }] });
    expect(guarded.notes).toEqual([]);
  });

  it('accepts the usual customizations without warnings and notes Rspack externals', () => {
    const plugin = new rspack.DefinePlugin({ CONTOSO_API: JSON.stringify('https://api.contoso.com') });
    const guarded = guardExtendConfig({ plugins: [plugin], module: { rules: [{ test: /\.txt$/, type: 'asset/source' }] }, externals: ['jquery'] });
    expect(guarded.ignored).toEqual([]);
    expect(guarded.config.plugins).toEqual([plugin]);
    expect(guarded.notes[0]).toContain('config/config.json "externals"');
  });

  it('ignores devServer: false', () => {
    expect(guardExtendConfig({ devServer: false }).ignored.map(({ key }) => key)).toEqual(['devServer']);
  });
});

const external = ({ request }: { request?: string }) => Promise.resolve(request === 'x' ? 'x' : undefined);

describe('mergeRspackConfig', () => {
  it('merges like webpack-merge: objects deep, arrays appended, other values replaced', () => {
    const ours = new rspack.DefinePlugin({ DEBUG: 'true' });
    const theirs = new rspack.DefinePlugin({ CONTOSO_API: '"x"' });
    const merged = mergeRspackConfig(
      {
        plugins: [ours],
        module: { rules: [{ test: /\.tsx?$/ }] },
        resolve: { alias: { react: '/project/node_modules/react' }, extensions: ['.ts'] },
        devtool: 'cheap-module-source-map',
        watchOptions: { ignored: /node_modules/ },
      },
      { plugins: [theirs], module: { rules: [{ test: /\.txt$/, type: 'asset/source' }] }, resolve: { alias: { '@src': '/project/src' } }, devtool: 'eval' },
    );
    expect(merged.plugins).toEqual([ours, theirs]);
    expect(merged.module?.rules).toHaveLength(2);
    expect(merged.resolve).toEqual({ alias: { react: '/project/node_modules/react', '@src': '/project/src' }, extensions: ['.ts'] });
    expect(merged.devtool).toBe('eval');
    expect(merged.watchOptions).toEqual({ ignored: /node_modules/ });
  });

  it('appends externals of any shape to fast-serve\'s list', () => {
    expect(mergeRspackConfig({ externals: ['a'] }, { externals: { jquery: 'jQuery' } }).externals).toEqual(['a', { jquery: 'jQuery' }]);
    expect(mergeRspackConfig({ externals: ['a'] }, { externals: [external] }).externals).toEqual(['a', external]);
  });
});

describe('mergeDevServer', () => {
  const request = { url: '/dist/a.js' } as never;
  it('keeps fast-serve\'s header function and adds the extension headers', () => {
    const merged = mergeDevServer({ headers: () => ({ 'Access-Control-Allow-Origin': '*' }) }, { headers: { 'X-Contoso': 'yes' } });
    expect(typeof merged.headers).toBe('function');
    const headers = merged.headers as (...args: unknown[]) => unknown;
    expect(headers(request, {}, undefined)).toEqual({ 'Access-Control-Allow-Origin': '*', 'X-Contoso': 'yes' });
    const fromArray = mergeDevServer({ headers: { A: '1' } }, { headers: [{ key: 'B', value: '2' }] }).headers as (...args: unknown[]) => unknown;
    expect(fromArray(request, {}, undefined)).toEqual({ A: '1', B: '2' });
  });

  it('runs the extension\'s setupMiddlewares on fast-serve\'s middleware list', () => {
    const base: DevServer = { setupMiddlewares: (middlewares) => [...middlewares, { name: 'fast-serve', middleware: () => undefined }] };
    const merged = mergeDevServer(base, { setupMiddlewares: (middlewares) => [{ name: 'contoso', middleware: () => undefined }, ...middlewares], proxy: [] });
    const names = merged.setupMiddlewares?.([{ name: 'built-in', middleware: () => undefined }], {}).map((entry) => (typeof entry === 'function' ? 'fn' : entry.name));
    expect(names).toEqual(['contoso', 'built-in', 'fast-serve']);
    expect(merged.proxy).toEqual([]);
  });
});

describe('withModulePaths', () => {
  it('gives helpers their own __dirname and __filename without shifting lines', () => {
    const file = path.join('/project', 'scripts', 'helpers.cjs');
    const source = withModulePaths("const path = require('path');\nexports.dir = __dirname;", file);
    expect(source.split('\n')).toHaveLength(2);
    expect(source).toContain(`var __dirname = ${JSON.stringify(path.dirname(file))};`);
    expect(withModulePaths('export const a = 1;', file)).toBe('export const a = 1;');
    expect(withModulePaths('#!/usr/bin/env node\nconsole.log(__filename);', file).startsWith('#!/usr/bin/env node\nvar __filename')).toBe(true);
  });
});

describe('webpackCustomizationHint', () => {
  it('stays silent without heft webpack customizations', () => {
    expect(webpackCustomizationHint(projectWith({ 'package.json': '{}' }))).toEqual([]);
  });

  it('names the customization files, the extend file, the docs and the skill', () => {
    const root = projectWith({
      'config/spfx-customize-webpack.js': 'module.exports = {};',
      'config/webpack-patch.json': '{ "patchFiles": ["./config/webpack-patch/defines.js", "./config/webpack-patch/missing.js"] }',
      'config/webpack-patch/defines.js': '',
    });
    const lines = webpackCustomizationHint(root, '/opt/fast-serve');
    expect(lines[0]).toBe(
      "hint: this project customizes heft's webpack config (config/spfx-customize-webpack.js, config/webpack-patch.json, config/webpack-patch/defines.js), but fast-serve builds its own Rspack config and doesn't run it.",
    );
    expect(lines.join('\n')).toContain('fast-serve/rspack.extend.mjs');
    expect(lines.join('\n')).toContain("import { defineConfig, rspack } from 'spfx-fast-serve-helpers';");
    expect(lines.join('\n')).toContain('#customizing-the-rspack-config');
    expect(lines.join('\n')).toContain('/opt/fast-serve/skills/fast-serve-rspack-config/SKILL.md');
  });

  it('points to the skill inside the installed package when present', () => {
    const root = projectWith({ 'config/spfx-customize-webpack.js': '', 'node_modules/spfx-fast-serve-helpers/skills/fast-serve-rspack-config/SKILL.md': '' });
    expect(webpackCustomizationHint(root).join('\n')).toContain('coding agents: node_modules/spfx-fast-serve-helpers/skills/fast-serve-rspack-config/SKILL.md');
  });
});
