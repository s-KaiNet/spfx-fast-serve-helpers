import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TILDE = '~';
const PKG_SCHEME = 'pkg:';

export interface SassFileImporter {
  findFileUrl(url: string, context: { containingUrl: URL | null }): URL | null;
}

export interface PackageRequest {
  packageName: string;
  subpath: string;
}

export function createSassPackageFolderImporter(fallbackFolder: string): SassFileImporter {
  return {
    findFileUrl(url, { containingUrl }) {
      const request = packageRequest(url);
      if (request === undefined) return null;
      const startFolder = containingUrl?.protocol === 'file:' ? path.dirname(fileURLToPath(containingUrl)) : fallbackFolder;
      const packageFolder = findPackageFolder(request.packageName, startFolder);
      return packageFolder === undefined ? null : pathToFileURL(packageFolder + request.subpath);
    },
  };
}

export function packageRequest(url: string): PackageRequest | undefined {
  const specifier = url.startsWith(TILDE) ? url.slice(TILDE.length) : url.startsWith(PKG_SCHEME) ? url.slice(PKG_SCHEME.length) : undefined;
  if (specifier === undefined) return undefined;
  const segments = specifier.split('/');
  const nameLength = specifier.startsWith('@') ? 2 : 1;
  const packageName = segments.slice(0, nameLength).join('/');
  if (!isPackageName(packageName)) return undefined;
  const rest = segments.slice(nameLength);
  return { packageName, subpath: rest.length > 0 ? `/${rest.join('/')}` : '' };
}

function isPackageName(name: string): boolean {
  return /^(?:@[^/@.][^/@]*\/)?[^/@.][^/@]*$/.test(name);
}

function findPackageFolder(packageName: string, startFolder: string): string | undefined {
  for (let folder = startFolder; ; folder = path.dirname(folder)) {
    const candidate = path.join(folder, 'node_modules', packageName);
    if (isDirectory(candidate)) return realpathSync(candidate);
    if (path.dirname(folder) === folder) return undefined;
  }
}

function isDirectory(folder: string): boolean {
  return statSync(folder, { throwIfNoEntry: false })?.isDirectory() ?? false;
}
