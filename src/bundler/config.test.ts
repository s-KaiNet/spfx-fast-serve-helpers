import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { multiComponentEntrySource } from '../features/build/entries.js';
import type { Logger } from '../shared/logger.js';
import { createProject } from '../project/index.js';
import type { BuildContext } from './featureApi/index.js';
import { createRspackConfig, FEATURES, mergeContributions } from './index.js';
import { watchIgnored } from './config.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/compile', import.meta.url));

function fixtureContext(): { context: BuildContext; warnings: string[] } {
  const warnings: string[] = [];
  const logger: Logger = { info: () => undefined, warn: (message) => warnings.push(message), error: (message) => warnings.push(message) };
  const context = { root: fixture, project: createProject(fixture, logger), options: { origin: 'https://localhost:4433', locale: 'en-us', overlay: true }, logger };
  return { context, warnings };
}

describe('createRspackConfig', () => {
  it('builds anonymous AMD bundles with AMD externals on the dev server origin', async () => {
    const config = await createRspackConfig(fixtureContext().context);
    expect(config).toMatchObject({
      mode: 'development',
      amd: {},
      externalsType: 'amd',
      devtool: 'cheap-module-source-map',
      cache: true,
      output: {
        publicPath: 'https://localhost:4433/dist/',
        library: { type: 'amd' },
        hashFunction: 'xxhash64',
        filename: '[name].js',
        path: path.join(fixture, 'temp', 'fast-serve', 'dist'),
      },
      module: { parser: { javascript: { exportsPresence: 'auto' } } },
    });
    expect(config.output?.library).not.toHaveProperty('name');
    expect(config.output?.uniqueName).toMatch(/^fast_serve_[0-9a-f]{16}$/);
  });

  it('declares every SPFx library, including the Microsoft Graph client, as an external', async () => {
    const config = await createRspackConfig(fixtureContext().context);
    expect(config.externals).toEqual(['@microsoft/microsoft-graph-client', '@microsoft/sp-core-library', '@microsoft/sp-loader', '@microsoft/sp-webpart-base']);
  });

  it('points single-component bundles at their source and others at a generated entry module', async () => {
    const config = await createRspackConfig(fixtureContext().context);
    expect(config.entry).toEqual({
      'single-web-part': path.join(fixture, 'src', 'webparts', 'hello', 'HelloWebPart.ts'),
      'shared-bundle': path.join(fixture, 'temp', 'fast-serve', 'bundle-entries', 'shared-bundle.js'),
    });
  });

  it('resolves React to the project copy and localized resources to their strings file', async () => {
    const config = await createRspackConfig(fixtureContext().context);
    expect(config.resolve?.alias).toMatchObject({
      react$: path.join(fixture, 'node_modules', 'react', 'index.js'),
      'react-dom$': path.join(fixture, 'node_modules', 'react-dom', 'index.js'),
      'react-dom/client$': path.join(fixture, 'node_modules', 'react-dom', 'client.js'),
      HelloWebPartStrings$: path.join(fixture, 'src', 'webparts', 'hello', 'loc', 'en-us.js'),
    });
    expect(config.resolve?.extensions?.slice(0, 2)).toEqual(['.ts', '.tsx']);
  });
});

describe('feature order', () => {
  it('assembles features in a fixed order', () => {
    expect(FEATURES.map((feature) => feature.name)).toEqual([
      'entries',
      'localLibraries',
      'typescript',
      'externals',
      'react',
      'localization',
      'assets',
      'styles',
      'defines',
      'manifests',
      'browserErrors',
      'tunnel',
      'hmr',
      'typeCheck',
      'lint',
    ]);
  });

  it('puts the TypeScript rules before the style rules', async () => {
    const rules = (await createRspackConfig(fixtureContext().context)).module?.rules ?? [];
    const firstIndex = (matches: (rule: unknown) => boolean) => rules.findIndex(matches);
    const typescript = firstIndex((rule) => JSON.stringify(rule).includes('builtin:swc-loader'));
    const styles = firstIndex((rule) => JSON.stringify(rule).includes('sp-css-loader'));
    expect(typescript).toBeGreaterThan(0);
    expect(styles).toBeGreaterThan(typescript);
  });
});

describe('multiComponentEntrySource', () => {
  it('re-exports each component under its export name', () => {
    const { context } = fixtureContext();
    const shared = context.project.bundles().find((bundle) => bundle.name === 'shared-bundle');
    if (!shared) throw new Error('fixture has no shared-bundle');
    expect(multiComponentEntrySource(shared).split('\n')).toEqual([
      `export * as a from ${JSON.stringify(path.join(fixture, 'src/webparts/first/FirstWebPart.ts').split(path.sep).join('/'))};`,
      `export * as b from ${JSON.stringify(path.join(fixture, 'src/extensions/banner/BannerApplicationCustomizer.ts').split(path.sep).join('/'))};`,
      '',
    ]);
  });
});

describe('watchIgnored', () => {
  it('ignores build output folders of the project and node_modules, not source folders with the same names', () => {
    const root = path.join(path.sep, 'work', 'my.project');
    const ignored = watchIgnored(root);
    for (const folder of ['lib', 'lib-commonjs', 'dist', 'temp', 'release', 'sharepoint', 'teams', 'jest-output', '.heft']) {
      expect(ignored.test(path.join(root, folder, 'file.js'))).toBe(true);
    }
    expect(ignored.test(path.join(root, 'node_modules', 'react', 'index.js'))).toBe(true);
    expect(ignored.test(path.join(root, 'src', 'lib', 'util.ts'))).toBe(false);
    expect(ignored.test(path.join(root, 'src', 'webparts', 'Hello.tsx'))).toBe(false);
    expect(ignored.test(path.join(path.sep, 'work', 'myXproject', 'lib', 'file.js'))).toBe(false);
  });

  it('matches Windows paths with either separator, as the watcher tests them with forward slashes', () => {
    const ignored = watchIgnored('C:\\Users\\anna\\my.project');
    expect(ignored.test('C:/Users/anna/my.project/temp/fast-serve/page-runtime/page-runtime.js')).toBe(true);
    expect(ignored.test('C:\\Users\\anna\\my.project\\lib\\index.js')).toBe(true);
    expect(ignored.test('C:/Users/anna/my.project/src/webparts/Hello.tsx')).toBe(false);
  });
});

describe('mergeContributions', () => {
  it('concatenates rules and plugins, merges entries and aliases, deduplicates extensions and externals', () => {
    const merged = mergeContributions([
      { entry: { a: './a.js' }, rules: [{ test: /a/ }], alias: { x$: '/x' }, extensions: ['.ts'], externals: ['lib'] },
      { entry: { b: './b.js' }, rules: [{ test: /b/ }], alias: { y$: '/y' }, extensions: ['.ts', '.css'], externals: ['lib', 'other'] },
    ]);
    expect(merged).toEqual({
      entry: { a: './a.js', b: './b.js' },
      rules: [{ test: /a/ }, { test: /b/ }],
      plugins: [],
      alias: { x$: '/x', y$: '/y' },
      extensions: ['.ts', '.css'],
      externals: ['lib', 'other'],
      middlewares: [],
    });
  });

  it('lets a later feature win an alias, so the React alias overrides a linked library alias', () => {
    expect(mergeContributions([{ alias: { react$: '/library/react' } }, { alias: { react$: '/project/react' } }]).alias).toEqual({ react$: '/project/react' });
    const names = FEATURES.map((feature) => feature.name);
    expect(names.indexOf('react')).toBeGreaterThan(names.indexOf('localLibraries'));
  });
});
