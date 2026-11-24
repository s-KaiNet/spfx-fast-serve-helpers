import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createProject } from './project.js';
import { fixturePath } from '../../test/kit/paths.js';

const root = fixturePath('basic');

function fixtureProject() {
  const warnings: string[] = [];
  const project = createProject(root, { warn: (message) => warnings.push(message) });
  return { project, warnings };
}

describe('createProject', () => {
  it('reads web part, Adaptive Card Extension, library and extension bundles', () => {
    const { project, warnings } = fixtureProject();
    const bundles = project.bundles();
    expect(bundles.map(({ name }) => name)).toEqual(['hello-web-part', 'card-adaptive-card-extension', 'tools-library', 'banner-application-customizer']);
    const [bundle, aceBundle, libraryBundle, extensionBundle] = bundles;
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
    expect(libraryBundle?.components).toHaveLength(1);
    expect(libraryBundle?.components[0]?.entryFile).toBe(path.join(root, 'src/libraries/tools/index.ts'));
    expect(libraryBundle?.components[0]?.manifest).toMatchObject({ alias: 'ToolsLibrary', componentType: 'Library', version: '1.2.3' });
    expect(warnings).toEqual([]);
  });

  it('skips Copilot components (SPFx 1.24 and later) and other component types fast-serve does not build, with a warning', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      mkdirSync(path.join(projectRoot, 'config'));
      mkdirSync(path.join(projectRoot, 'src/copilotComponents/links'), { recursive: true });
      writeFileSync(path.join(projectRoot, 'package.json'), '{ "version": "1.0.0" }');
      writeFileSync(path.join(projectRoot, 'src/copilotComponents/links/LinksCopilotComponent.ts'), 'export default class LinksCopilotComponent {}\n');
      writeFileSync(
        path.join(projectRoot, 'src/copilotComponents/links/LinksCopilotComponent.manifest.json'),
        JSON.stringify({ id: 'c1', alias: 'LinksCopilotComponent', componentType: 'CopilotComponent', copilotType: 'Ux', version: '*', tools: [] }),
      );
      writeFileSync(path.join(projectRoot, 'src/App.manifest.json'), JSON.stringify({ id: 'a1', alias: 'OldApplication', componentType: 'Application' }));
      writeFileSync(
        path.join(projectRoot, 'config/config.json'),
        JSON.stringify({
          bundles: {
            links: { components: [{ entrypoint: './lib/copilotComponents/links/LinksCopilotComponent.js', manifest: './src/copilotComponents/links/LinksCopilotComponent.manifest.json' }] },
            app: { components: [{ entrypoint: './lib/App.js', manifest: './src/App.manifest.json' }] },
          },
        }),
      );
      const warnings: string[] = [];
      const bundles = createProject(projectRoot, { warn: (message) => warnings.push(message) }).bundles();
      expect(bundles).toEqual([]);
      expect(warnings).toEqual([
        'LinksCopilotComponent: componentType "CopilotComponent" is not supported by fast-serve, skipped (its bundle is not built or listed in the debug manifests)',
        'OldApplication: componentType "Application" is not supported by fast-serve, skipped (its bundle is not built or listed in the debug manifests)',
      ]);
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
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
    expect(project.serveConfig()).toEqual({ port: 4400, initialPage: 'https://{tenantDomain}/sites/dev/SitePages/Test.aspx' });
  });

  it('finds SPFx libraries like SPFx does: transitively through packages that ship manifests', () => {
    const { project } = fixtureProject();
    const modules = path.join(root, 'node_modules/@microsoft');
    expect([...project.libraries().values()]).toEqual([
      {
        packageName: '@microsoft/sp-core-library',
        id: '7263c7d0-1d6a-45ec-8d85-d4d1d234171b',
        version: '1.23.2',
        packageDir: path.join(modules, 'sp-core-library'),
      },
      {
        packageName: '@microsoft/sp-lodash-subset',
        id: '73e1dc6c-8441-42cc-ad47-4bd3659f8a3a',
        version: '1.23.2',
        packageDir: path.join(modules, 'sp-lodash-subset'),
      },
      {
        packageName: '@microsoft/sp-loader',
        id: '1c6c9123-7aac-41f3-a376-3caea41ed83f',
        version: '1.23.2',
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

  it('finds the strings file of one locale without a fallback or a warning', () => {
    const { project, warnings } = fixtureProject();
    expect(project.localizedResourceFile('HelloWebPartStrings', 'de-de')).toBe(path.join(root, 'src/webparts/hello/loc/de-de.js'));
    expect(project.localizedResourceFile('ControlStrings', 'de-de')).toBeUndefined();
    expect(project.localizedResourceFile('UnknownStrings', 'en-us')).toBeUndefined();
    expect(warnings).toEqual([]);
  });

  it('reads each fact once for the lifetime of the model', () => {
    const { project } = fixtureProject();
    for (const read of [() => project.bundles(), () => project.configExternals(), () => project.localizedResources('en-us'), () => project.tsconfigCompilerOptions(), () => project.codeRoots()]) {
      expect(read()).toBe(read());
    }
  });

  it('reads tsconfig path aliases through extends', () => {
    const { project } = fixtureProject();
    const paths = project.tsconfigPaths();
    expect(paths?.mappings).toEqual([{ prefix: '@components/', suffix: '', wildcard: true, targets: ['./src/webparts/hello/components/*'] }]);
    expect(paths?.files).toEqual([path.join(root, 'tsconfig.json'), path.join(root, 'tsconfig.base.json')]);
    expect(project.tsconfigPaths()).toBe(paths);
  });

  it('lists the project as its only code root without linked libraries', () => {
    const { project } = fixtureProject();
    expect(project.role).toBe('consumer');
    expect(project.codeRoots()).toEqual([{ label: 'the project', root, sourceDir: path.join(root, 'src'), project }]);
  });

  it('merges compiler options through extends', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      expect(createProject(projectRoot, { warn: () => undefined }).tsconfigCompilerOptions()).toEqual({});
      writeFileSync(path.join(projectRoot, 'base.json'), '{ "compilerOptions": { "experimentalDecorators": true, "target": "es5" } }');
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "extends": "./base.json", "compilerOptions": { "target": "es2022" } }');
      expect(createProject(projectRoot, { warn: () => undefined }).tsconfigCompilerOptions()).toEqual({ experimentalDecorators: true, target: 'es2022' });
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  });

  it('has no aliases without tsconfig paths or baseUrl, and warns about an unreadable tsconfig', () => {
    const projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-project-'));
    try {
      const warnings: string[] = [];
      const modelNow = () => createProject(projectRoot, { warn: (message) => warnings.push(message) });
      expect(modelNow().tsconfigPaths()).toBeUndefined();
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "compilerOptions": { "strict": true } }');
      expect(modelNow().tsconfigPaths()).toBeUndefined();
      writeFileSync(path.join(projectRoot, 'tsconfig.json'), '{ "extends": "./missing.json" }');
      expect(modelNow().tsconfigPaths()).toBeUndefined();
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
      path.join(root, 'src/libraries/tools/ToolsLibrary.manifest.json'),
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
