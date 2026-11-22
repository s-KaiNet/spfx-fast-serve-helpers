import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { createSassPackageFolderImporter, packageRequest } from './sassPackageImporter.js';

const folders: string[] = [];

afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function projectWith(files: string[]): string {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'fast-serve-sass-importer-')));
  folders.push(root);
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '');
  }
  return root;
}

describe('packageRequest', () => {
  it('splits ~ and pkg: specifiers into the package name and the path inside it', () => {
    expect(packageRequest('~@scope/pkg/dist/sass/x.scss')).toEqual({ packageName: '@scope/pkg', subpath: '/dist/sass/x.scss' });
    expect(packageRequest('pkg:pkg/x')).toEqual({ packageName: 'pkg', subpath: '/x' });
    expect(packageRequest('~pkg')).toEqual({ packageName: 'pkg', subpath: '' });
  });

  it('ignores relative, absolute and malformed specifiers', () => {
    expect(packageRequest('./x')).toBeUndefined();
    expect(packageRequest('pkg/x')).toBeUndefined();
    expect(packageRequest('file:///x.scss')).toBeUndefined();
    expect(packageRequest('~/x')).toBeUndefined();
    expect(packageRequest('~@scope')).toBeUndefined();
  });
});

describe('createSassPackageFolderImporter', () => {
  it('finds the package folder from the importing file, nearest node_modules first', () => {
    const root = projectWith(['node_modules/pkg/package.json', 'node_modules/outer/node_modules/pkg/package.json', 'node_modules/outer/x.scss']);
    const importer = createSassPackageFolderImporter(root);

    expect(importer.findFileUrl('~pkg/dist/x', { containingUrl: pathToFileURL(path.join(root, 'node_modules/outer/x.scss')) })?.href).toBe(
      pathToFileURL(path.join(root, 'node_modules/outer/node_modules/pkg/dist/x')).href,
    );
    expect(importer.findFileUrl('pkg:pkg/dist/x', { containingUrl: null })?.href).toBe(pathToFileURL(path.join(root, 'node_modules/pkg/dist/x')).href);
  });

  it('returns null for missing packages and other URLs', () => {
    const root = projectWith(['src/a.scss']);
    const importer = createSassPackageFolderImporter(root);
    const containingUrl = pathToFileURL(path.join(root, 'src/a.scss'));

    expect(importer.findFileUrl('~missing/x', { containingUrl })).toBeNull();
    expect(importer.findFileUrl('colors', { containingUrl })).toBeNull();
  });
});
