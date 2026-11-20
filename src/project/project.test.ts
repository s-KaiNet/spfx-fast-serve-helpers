import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createProject } from './project.js';

const root = fileURLToPath(new URL('../../test/fixtures/basic', import.meta.url));

function fixtureProject() {
  const warnings: string[] = [];
  const project = createProject(root, { warn: (message) => warnings.push(message) });
  return { project, warnings };
}

describe('createProject', () => {
  it('reads web part, Adaptive Card Extension and extension bundles and skips unsupported component types', () => {
    const { project, warnings } = fixtureProject();
    const bundles = project.bundles();
    expect(bundles.map(({ name }) => name)).toEqual(['hello-web-part', 'card-adaptive-card-extension', 'banner-application-customizer']);
    const [bundle, aceBundle, extensionBundle] = bundles;
    expect(bundle?.name).toBe('hello-web-part');
    expect(bundle?.components).toHaveLength(1);
    const component = bundle?.components[0];
    expect(component?.bundleName).toBe('hello-web-part');
    expect(component?.entryFile).toBe(path.join(root, 'src/webparts/hello/HelloWebPart.ts'));
    expect(component?.manifestFile).toBe(path.join(root, 'src/webparts/hello/HelloWebPart.manifest.json'));
    expect(component?.manifest).toMatchObject({
      id: '11111111-2222-3333-4444-555555555555',
      alias: 'HelloWebPart',
      componentType: 'WebPart',
      version: '1.2.3',
      preconfiguredEntries: [{ title: { default: 'Hello // not a comment' } }],
    });
    expect(extensionBundle?.components[0]?.manifest).toMatchObject({
      alias: 'BannerApplicationCustomizer',
      componentType: 'Extension',
      extensionType: 'ApplicationCustomizer',
      version: '1.2.3',
    });
    expect(extensionBundle?.components[0]?.entryFile).toBe(path.join(root, 'src/extensions/banner/BannerApplicationCustomizer.ts'));
    expect(aceBundle?.components[0]?.manifest).toMatchObject({
      id: '88888888-2222-3333-4444-555555555555',
      alias: 'CardAdaptiveCardExtension',
      componentType: 'AdaptiveCardExtension',
      version: '1.2.3',
    });
    expect(aceBundle?.components[0]?.entryFile).toBe(path.join(root, 'src/adaptiveCardExtensions/card/CardAdaptiveCardExtension.ts'));
    expect(warnings).toEqual(['ToolsLibrary: library components are not served (SharePoint loads the deployed copy); projects that link this one as a dependency compile its src']);
  });

  it('rejects an extension manifest without extensionType', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      mkdirSync(path.join(projectRoot, 'config'));
      mkdirSync(path.join(projectRoot, 'src'));
      writeFileSync(path.join(projectRoot, 'package.json'), '{ "version": "1.0.0" }');
      writeFileSync(path.join(projectRoot, 'src/Ext.manifest.json'), '{ "id": "x", "componentType": "Extension" }');
      writeFileSync(
        path.join(projectRoot, 'config/config.json'),
        JSON.stringify({ bundles: { ext: { components: [{ entrypoint: './lib/Ext.js', manifest: './src/Ext.manifest.json' }] } } }),
      );
      expect(() => createProject(projectRoot, { warn: () => undefined }).bundles()).toThrow(/an "Extension" manifest needs "extensionType"/);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('reads serve.json serveConfigurations', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      mkdirSync(path.join(projectRoot, 'config'));
      const serveConfigurations = {
        default: { pageUrl: 'https://{tenantDomain}/SitePages/a.aspx', customActions: { 'f1e9c965-12f5-4beb-9103-7640ed381a72': { location: 'ClientSideExtension.ApplicationCustomizer', properties: { testMessage: 'Hi' } } } },
        rating: { pageUrl: 'https://t/Lists/L/AllItems.aspx', fieldCustomizers: { Title: { id: '21fe7eba-88c8-4a4b-ad68-52b7d32f1607' } } },
        form: { pageUrl: 'https://t/_layouts/15/SPListForm.aspx', formCustomizer: { componentId: 'c', PageType: 8, RootFolder: '/sites/s/Lists/L' } },
      };
      writeFileSync(path.join(projectRoot, 'config/serve.json'), JSON.stringify({ port: 4321, serveConfigurations }));
      expect(createProject(projectRoot, { warn: () => undefined }).serveConfig()).toEqual({ port: 4321, initialPage: undefined, serveConfigurations });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('reads package.json and serve.json', () => {
    const { project } = fixtureProject();
    expect(project.packageJson()).toMatchObject({ name: 'basic-fixture', version: '1.2.3' });
    expect(project.serveConfig()).toEqual({ port: 4400, initialPage: 'https://{tenantDomain}/_layouts/workbench.aspx' });
  });

  it('finds SPFx libraries like SPFx does: transitively through packages that ship manifests', () => {
    const { project } = fixtureProject();
    const modules = path.join(root, 'node_modules/@microsoft');
    expect([...project.libraries().values()]).toEqual([
      {
        packageName: '@microsoft/sp-core-library',
        id: '7263c7d0-1d6a-45ec-8d85-d4d1d234171b',
        version: '1.24.1',
        packageDir: path.join(modules, 'sp-core-library'),
      },
      {
        packageName: '@microsoft/sp-lodash-subset',
        id: '73e1dc6c-8441-42cc-ad47-4bd3659f8a3a',
        version: '1.24.1',
        packageDir: path.join(modules, 'sp-lodash-subset'),
      },
      {
        packageName: '@microsoft/sp-loader',
        id: '1c6c9123-7aac-41f3-a376-3caea41ed83f',
        version: '1.24.1',
        packageDir: path.join(modules, 'sp-loader'),
      },
    ]);
  });

  it('knows the SPFx library that ships without a manifest, like heft: @microsoft/microsoft-graph-client from the project', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      const graphDir = path.join(projectRoot, 'node_modules/@microsoft/microsoft-graph-client');
      mkdirSync(graphDir, { recursive: true });
      writeFileSync(path.join(projectRoot, 'package.json'), '{ "version": "1.0.0" }');
      writeFileSync(path.join(graphDir, 'package.json'), '{ "name": "@microsoft/microsoft-graph-client", "version": "3.0.7-preview.1" }');
      expect([...createProject(projectRoot, { warn: () => undefined }).libraries().values()]).toEqual([
        { packageName: '@microsoft/microsoft-graph-client', id: '32b9363b-09ff-4959-929a-cab2663fb223', version: '3.0.7', packageDir: realpathSync(graphDir) },
      ]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('maps localized resources to src (lib paths) or keeps node_modules paths', () => {
    const { project } = fixtureProject();
    const resources = project.localizedResources('en-us');
    expect(resources.get('HelloWebPartStrings')).toEqual({
      name: 'HelloWebPartStrings',
      file: path.join(root, 'src/webparts/hello/loc/en-us.js'),
      locale: 'en-us',
    });
    expect(resources.get('ControlStrings')?.file).toBe(path.join(root, 'node_modules/@pnp/controls/lib/loc/en-us.js'));
  });

  it('falls back to en-us when a locale is missing', () => {
    const { project, warnings } = fixtureProject();
    const resources = project.localizedResources('de-de');
    expect(resources.get('HelloWebPartStrings')?.locale).toBe('de-de');
    expect(resources.get('ControlStrings')?.locale).toBe('en-us');
    expect(warnings).toContain('ControlStrings: no "de-de" strings, using en-us');
  });

  it('caches facts and invalidates them for model files only', () => {
    const { project } = fixtureProject();
    const bundles = project.bundles();
    expect(project.bundles()).toBe(bundles);
    expect(project.invalidate(path.join(root, 'src/webparts/hello/components/Hello.tsx'))).toBeUndefined();
    expect(project.bundles()).toBe(bundles);
    expect(project.invalidate(path.join(root, 'src/webparts/hello/HelloWebPart.manifest.json'))).toBe('model');
    expect(project.bundles()).not.toBe(bundles);
    expect(project.bundles()).toEqual(bundles);
    expect(project.invalidate(path.join(root, 'config/config.json'))).toBe('model');
  });

  it('reads tsconfig path aliases through extends and invalidates them separately', () => {
    const { project } = fixtureProject();
    const paths = project.tsconfigPaths();
    expect(paths?.mappings).toEqual([{ prefix: '@components/', suffix: '', wildcard: true, targets: ['./src/webparts/hello/components/*'] }]);
    expect(paths?.pathsBase).toBe(root);
    expect(project.tsconfigPaths()).toBe(paths);
    const bundles = project.bundles();
    expect(project.invalidate(path.join(root, 'tsconfig.base.json'))).toBe('tsconfig');
    expect(project.tsconfigPaths()).not.toBe(paths);
    expect(project.bundles()).toBe(bundles);
  });

  it('merges compiler options through extends and re-reads them after a tsconfig change', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      const project = createProject(projectRoot, { warn: () => undefined });
      expect(project.tsconfigCompilerOptions()).toEqual({});
      writeFileSync(path.join(projectRoot, 'base.json'), '{ "compilerOptions": { "experimentalDecorators": true, "target": "es5" } }');
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "extends": "./base.json", "compilerOptions": { "target": "es2022" } }');
      expect(project.invalidate(path.join(projectRoot, 'tsconfig.json'))).toBe('tsconfig');
      const options = project.tsconfigCompilerOptions();
      expect(options).toEqual({ experimentalDecorators: true, target: 'es2022' });
      expect(project.tsconfigCompilerOptions()).toBe(options);
      writeFileSync(path.join(projectRoot, 'base.json'), '{ "compilerOptions": { "emitDecoratorMetadata": true } }');
      expect(project.invalidate(path.join(projectRoot, 'base.json'))).toBe('tsconfig');
      expect(project.tsconfigCompilerOptions()).toEqual({ emitDecoratorMetadata: true, target: 'es2022' });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('has no aliases without tsconfig paths or baseUrl, and warns about an unreadable tsconfig', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      const warnings: string[] = [];
      const project = createProject(projectRoot, { warn: (message) => warnings.push(message) });
      expect(project.tsconfigPaths()).toBeUndefined();
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }');
      expect(project.invalidate(path.join(projectRoot, 'tsconfig.json'))).toBe('tsconfig');
      expect(project.tsconfigPaths()).toBeUndefined();
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "extends": "./missing.json" }');
      project.invalidate(path.join(projectRoot, 'tsconfig.json'));
      expect(project.tsconfigPaths()).toBeUndefined();
      expect(warnings).toEqual([expect.stringMatching(/^tsconfig\.json is ignored: .*missing\.json/)]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('lists the files that define the model', () => {
    const { project } = fixtureProject();
    expect(project.modelFiles()).toEqual([
      path.join(root, 'package.json'),
      path.join(root, 'config/config.json'),
      path.join(root, 'config/serve.json'),
      path.join(root, 'config/sass.json'),
      path.join(root, 'src/webparts/hello/HelloWebPart.manifest.json'),
      path.join(root, 'src/adaptiveCardExtensions/card/CardAdaptiveCardExtension.manifest.json'),
      path.join(root, 'src/extensions/banner/BannerApplicationCustomizer.manifest.json'),
      path.join(root, 'tsconfig.json'),
      path.join(root, 'tsconfig.base.json'),
      path.join(root, 'assets/legacy-plugin.js'),
    ]);
  });

  it('reads config.json externals like heft: URLs, local files, globals, SPFx libraries first', () => {
    const { project, warnings } = fixtureProject();
    expect([...project.configExternals().values()]).toEqual([
      {
        name: 'jquery',
        source: { type: 'url', url: 'https://code.jquery.com/jquery-3.7.1.min.js' },
      },
      {
        name: 'legacy-plugin',
        source: { type: 'file', file: path.join(root, 'assets/legacy-plugin.js') },
        globalName: 'LegacyPlugin',
        globalDependencies: ['jquery'],
      },
    ]);
    expect(warnings).toEqual([
      'config/config.json externals "@microsoft/sp-core-library" is ignored: it is an SPFx library, loaded from SharePoint like in heft',
      `config/config.json externals "missing-file": ${path.join(root, 'assets/missing.js').split(path.sep).join('/')} does not exist (paths are relative to the project root), skipped`,
      'config/config.json externals "orphan-plugin": global dependency "not-defined" is not a usable external ' +
        '(it must be a valid, non-circular entry in "externals" and must not be an SPFx library), skipped',
    ]);
  });

  it('reloads the model when a local external file changes', () => {
    const { project } = fixtureProject();
    const externals = project.configExternals();
    expect(project.invalidate(path.join(root, 'assets/legacy-plugin.js'))).toBe('model');
    expect(project.configExternals()).not.toBe(externals);
    expect(project.configExternals()).toEqual(externals);
  });

  it('skips externals whose global dependencies form a cycle', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      const warnings: string[] = [];
      mkdirSync(path.join(projectRoot, 'config'));
      writeFileSync(
        path.join(projectRoot, 'config/config.json'),
        JSON.stringify({
          externals: {
            a: { path: 'https://x.invalid/a.js', globalName: 'A', globalDependencies: ['b'] },
            b: { path: 'https://x.invalid/b.js', globalName: 'B', globalDependencies: ['a'] },
            c: { path: 'https://x.invalid/c.js' },
            d: { globalName: 'D' },
          },
        }),
      );
      writeFileSync(path.join(projectRoot, 'package.json'), '{ "version": "1.0.0" }');
      const project = createProject(projectRoot, { warn: (message) => warnings.push(message) });
      expect([...project.configExternals().keys()]).toEqual(['c']);
      expect(warnings).toEqual([
        'config/config.json externals "d": needs a path string or { "path", "globalName" }, skipped',
        expect.stringContaining('"b": global dependency "a"'),
        expect.stringContaining('"a": global dependency "b"'),
      ]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('explains a missing config/config.json', () => {
    const project = createProject(path.join(root, 'src'), { warn: () => undefined });
    expect(() => project.bundles()).toThrow(/config\.json not found/);
  });
});
