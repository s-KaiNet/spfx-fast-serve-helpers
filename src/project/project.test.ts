import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
  it('reads web part bundles and skips unsupported component types', () => {
    const { project, warnings } = fixtureProject();
    const bundles = project.bundles();
    expect(bundles).toHaveLength(1);
    const [bundle] = bundles;
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
    expect(warnings).toEqual(['BannerApplicationCustomizer: componentType "Extension" is not supported yet, skipped']);
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
      expect(warnings).toEqual([expect.stringMatching(/^tsconfig\.json "paths" and "baseUrl" are ignored: .*missing\.json/)]);
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
      path.join(root, 'src/webparts/hello/HelloWebPart.manifest.json'),
      path.join(root, 'tsconfig.json'),
      path.join(root, 'tsconfig.base.json'),
    ]);
  });

  it('explains a missing config/config.json', () => {
    const project = createProject(path.join(root, 'src'), { warn: () => undefined });
    expect(() => project.bundles()).toThrow(/config\.json not found/);
  });
});
