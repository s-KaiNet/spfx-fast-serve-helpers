import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { COMPILE_FIXTURE, LIBRARY_FIXTURE, LIBRARY_PACKAGE, linkLocalPackage } from '../../../test/kit/compileKit.js';
import { createProject } from '../project.js';
import { isOutsideNodeModules, readLibraryComponent } from './localLibraries.js';

const LIBRARY_ID = '5c1d6a0e-1f7b-4a8e-9d43-2b7f0c9e1a11';
const BASE_ID = '9a0c2f4e-6b1d-4c3a-8e57-0d2f6a8b4c10';

function writeJson(file: string, content: object): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(content, undefined, 2));
}

function writeLibraryProject(root: string, name: string, id: string): void {
  writeJson(path.join(root, 'package.json'), { name, version: '2.1.0' });
  writeJson(path.join(root, 'config', 'config.json'), {
    bundles: { lib: { components: [{ entrypoint: './lib/index.js', manifest: './src/Lib.manifest.json' }] } },
    localizedResources: { BaseLibStrings: 'lib/loc/{locale}.js' },
  });
  writeJson(path.join(root, 'src', 'Lib.manifest.json'), { id, alias: 'BaseLib', componentType: 'Library', version: '*' });
  writeFileSync(path.join(root, 'src', 'index.ts'), 'export const base = 1;\n');
  mkdirSync(path.join(root, 'src', 'loc'), { recursive: true });
  writeFileSync(path.join(root, 'src', 'loc', 'en-us.js'), 'define([], function () { return { "Base": "base" }; });\n');
}

describe('local SPFx library projects', () => {
  let workspace: string;
  let consumer: string;
  let library: string;
  let warnings: string[];

  const project = (deployedLibraries: string[] = []) => createProject(consumer, { warn: (message) => warnings.push(message) }, { deployedLibraries });

  beforeEach(() => {
    workspace = realpathSync(mkdtempSync(path.join(tmpdir(), 'fast-serve-local-libraries-')));
    consumer = path.join(workspace, 'consumer');
    library = path.join(workspace, 'corp-lib');
    cpSync(COMPILE_FIXTURE, consumer, { recursive: true });
    cpSync(LIBRARY_FIXTURE, library, { recursive: true });
    linkLocalPackage(consumer, LIBRARY_PACKAGE, library);
    warnings = [];
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it('detects a linked library project and describes it from its own config', () => {
    const [found, ...others] = project().localLibraries();
    expect(others).toEqual([]);
    expect(found).toMatchObject({
      packageName: LIBRARY_PACKAGE,
      root: library,
      id: LIBRARY_ID,
      alias: 'CorpLibLibrary',
      version: '0.0.3',
      entryFile: path.join(library, 'src', 'index.ts'),
      sourceDir: path.join(library, 'src'),
    });
    expect([...(found?.project.localizedResources('en-us').values() ?? [])]).toEqual([{ name: 'CorpLibStrings', file: path.join(library, 'src', 'loc', 'en-us.js'), locale: 'en-us' }]);
    expect(found?.project.tsconfigPaths()?.mappings).toEqual([{ prefix: '@corp/', suffix: '', wildcard: true, targets: ['src/shared/*'] }]);
    expect(warnings).toEqual([]);
  });

  it('keeps a built linked library out of the SPFx library externals', () => {
    writeJson(path.join(library, 'dist', 'corp-lib.manifest.json'), { id: LIBRARY_ID, version: '0.0.3', componentType: 'Library' });
    const model = project();
    expect(model.libraries().has(LIBRARY_PACKAGE)).toBe(false);
    expect(model.localLibraries().map((found) => found.packageName)).toEqual([LIBRARY_PACKAGE]);
  });

  it('merges the library config.json externals, the project winning on a name clash', () => {
    expect(project().configExternals().get('corp-legacy')).toMatchObject({ source: { type: 'url', url: 'https://cdn.contoso.com/corp-legacy.js' }, globalName: 'CorpLegacy' });
    writeJson(path.join(consumer, 'config', 'config.json'), {
      bundles: { 'single-web-part': { components: [{ entrypoint: './lib/webparts/hello/HelloWebPart.js', manifest: './src/webparts/hello/HelloWebPart.manifest.json' }] } },
      externals: { 'corp-legacy': 'https://cdn.contoso.com/corp-legacy-2.js' },
    });
    expect(project().configExternals().get('corp-legacy')?.source).toEqual({ type: 'url', url: 'https://cdn.contoso.com/corp-legacy-2.js' });
  });

  it('adds the library model files to the restart triggers and lists the library as a code root', () => {
    const model = project();
    const files = model.modelFiles();
    for (const file of ['package.json', 'config/config.json', 'tsconfig.json', 'src/libraries/corpLib/CorpLibLibrary.manifest.json']) {
      expect(files).toContain(path.join(library, file));
    }
    expect(files).not.toContain(path.join(library, 'config', 'serve.json'));
    expect(files).not.toContain(path.join(library, 'config', 'sass.json'));
    const [consumerRoot, libraryRoot, ...others] = model.codeRoots();
    expect(consumerRoot?.project).toBe(model);
    expect(libraryRoot).toMatchObject({ label: LIBRARY_PACKAGE, root: library, sourceDir: path.join(library, 'src') });
    expect(libraryRoot?.project.role).toBe('library');
    expect(others).toEqual([]);
  });

  it('follows library dependencies of libraries and leaves registry libraries as externals', () => {
    const base = path.join(workspace, 'base-lib');
    writeLibraryProject(base, '@contoso/base-lib', BASE_ID);
    linkLocalPackage(library, '@contoso/base-lib', base);
    const registry = path.join(consumer, 'node_modules', '@contoso', 'registry-lib');
    writeLibraryProject(registry, '@contoso/registry-lib', 'b3c7e9a1-2d4f-4b6a-8c0e-1f3a5b7d9e21');
    writeJson(path.join(registry, 'dist', 'registry-lib.manifest.json'), { id: 'b3c7e9a1-2d4f-4b6a-8c0e-1f3a5b7d9e21', version: '2.1.0' });
    const packageFile = path.join(consumer, 'package.json');
    const json = JSON.parse(readText(packageFile)) as { dependencies: Record<string, string> };
    writeJson(packageFile, { ...json, dependencies: { ...json.dependencies, '@contoso/registry-lib': '2.1.0' } });
    const model = project();
    expect(model.localLibraries().map((found) => [found.packageName, found.root])).toEqual([
      [LIBRARY_PACKAGE, library],
      ['@contoso/base-lib', base],
    ]);
    expect(model.libraries().get('@contoso/registry-lib')).toMatchObject({ id: 'b3c7e9a1-2d4f-4b6a-8c0e-1f3a5b7d9e21', version: '2.1.0' });
    expect(model.libraries().has('@contoso/base-lib')).toBe(false);
  });

  it('loads an opted-out library from SharePoint by the id of its source manifest', () => {
    const model = project([LIBRARY_PACKAGE]);
    expect(model.localLibraries()).toEqual([]);
    expect(model.libraries().get(LIBRARY_PACKAGE)).toEqual({ packageName: LIBRARY_PACKAGE, id: LIBRARY_ID, version: '0.0.3', packageDir: library });
    expect(model.configExternals().has('corp-legacy')).toBe(false);
  });

  it('skips a library whose entry has no source, with a warning', () => {
    rmSync(path.join(library, 'src', 'index.ts'));
    expect(project().localLibraries()).toEqual([]);
    expect(warnings).toEqual([`${LIBRARY_PACKAGE}: the source of the library entry ./lib/index.js was not found under src/, the package is bundled from its main file`]);
  });

  it('reads the library component of a project and knows node_modules paths', () => {
    expect(readLibraryComponent(library, '9.9.9')).toMatchObject({ id: LIBRARY_ID, version: '9.9.9', entrypoint: './lib/index.js' });
    expect(readLibraryComponent(consumer, '1.0.0')).toBeUndefined();
    expect(isOutsideNodeModules(library)).toBe(true);
    expect(isOutsideNodeModules(path.join(consumer, 'node_modules', '.pnpm', 'x'))).toBe(false);
  });
});

function readText(file: string): string {
  return readFileSync(file, 'utf8');
}
