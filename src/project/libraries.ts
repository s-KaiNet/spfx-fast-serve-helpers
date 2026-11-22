import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isObject, type JsonObject } from '../shared/guards.js';
import { readJsoncFile } from '../shared/jsonc.js';
import { isOutsideNodeModules, readLibraryComponent } from './localLibraries.js';
import type { LocalLibraryPackage, SpfxLibrary } from './types.js';

const MANIFEST_FILE = /^[^.\\/]+\.manifest\.json$/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

const LIBRARIES_WITHOUT_MANIFEST = [{ packageName: '@microsoft/microsoft-graph-client', id: '32b9363b-09ff-4959-929a-cab2663fb223' }];

interface LibraryManifest {
  id: string;
  version: string;
  rootComponentId?: string;
}

export interface LibraryScan {
  deployed: Map<string, SpfxLibrary>;
  local: Map<string, LocalLibraryPackage>;
}

export interface LibraryScanOptions {
  deployedLibraries?: readonly string[];
}

export function scanLibraries(root: string, { deployedLibraries = [] }: LibraryScanOptions = {}): LibraryScan {
  const libraries = new Map<string, SpfxLibrary>();
  const local = new Map<string, LocalLibraryPackage>();
  const visited = new Set<string>();
  const projectJson = readPackageJson(root);
  const projectName = typeof projectJson.name === 'string' ? projectJson.name : undefined;
  const projectDir = realDirectory(root);
  const queue = dependencyNames(projectJson).map((packageName) => ({ packageName, fromDir: root }));

  for (let next = queue.shift(); next; next = queue.shift()) {
    const { packageName } = next;
    const packageDir = findPackageDirectory(packageName, next.fromDir);
    if (!packageDir || visited.has(packageDir)) continue;
    visited.add(packageDir);
    const packageJson = readPackageJson(packageDir);
    const isProject = packageName === projectName || packageDir === projectDir;
    const localLibrary = isProject || !isOutsideNodeModules(packageDir) ? undefined : readLibraryComponent(packageDir, stringVersion(packageJson));
    if (localLibrary && !deployedLibraries.includes(packageName)) {
      if (!local.has(packageName)) local.set(packageName, { packageName, root: packageDir });
    } else {
      const manifests = readDistManifests(packageDir);
      const manifest = singleLibraryManifest(manifests) ?? localLibrary;
      if (manifest && !isProject && !libraries.has(packageName)) {
        libraries.set(packageName, { packageName, id: manifest.id, version: manifest.version, packageDir });
      }
      if (manifests.length === 0 && !localLibrary) continue;
    }
    for (const dependency of dependencyNames(packageJson)) queue.push({ packageName: dependency, fromDir: packageDir });
  }
  for (const library of librariesWithoutManifest(root)) {
    if (!libraries.has(library.packageName) && !local.has(library.packageName)) libraries.set(library.packageName, library);
  }
  return { deployed: libraries, local };
}

function realDirectory(dir: string): string {
  try {
    return realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

function stringVersion(packageJson: JsonObject): string {
  return typeof packageJson.version === 'string' ? packageJson.version : '0.0.0';
}

function librariesWithoutManifest(root: string): SpfxLibrary[] {
  return LIBRARIES_WITHOUT_MANIFEST.flatMap(({ packageName, id }) => {
    const packageDir = findPackageDirectory(packageName, root);
    const version = packageDir === undefined ? undefined : readPackageJson(packageDir).version;
    if (packageDir === undefined || typeof version !== 'string') return [];
    return [{ packageName, id, version: version.split('-')[0] ?? version, packageDir }];
  });
}

function singleLibraryManifest(manifests: readonly LibraryManifest[]): LibraryManifest | undefined {
  if (manifests.length === 1) return manifests[0];
  if (manifests.length !== 2) return undefined;
  const [first, second] = manifests;
  if (first?.rootComponentId === second?.id) return second;
  if (second?.rootComponentId === first?.id) return first;
  return undefined;
}

function readDistManifests(packageDir: string): LibraryManifest[] {
  const distDir = path.join(packageDir, 'dist');
  if (!existsSync(distDir)) return [];
  return readdirSync(distDir)
    .filter((file) => MANIFEST_FILE.test(file))
    .flatMap((file) => {
      const manifest = readManifestSafely(path.join(distDir, file));
      if (!isObject(manifest) || typeof manifest.id !== 'string' || typeof manifest.version !== 'string') return [];
      const rootComponentId = typeof manifest.rootComponentId === 'string' ? manifest.rootComponentId : undefined;
      return [{ id: manifest.id, version: manifest.version, rootComponentId }];
    });
}

function readManifestSafely(file: string): unknown {
  try {
    return readJsoncFile(file);
  } catch {
    return undefined;
  }
}

function findPackageDirectory(packageName: string, fromDir: string): string | undefined {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', packageName);
    if (existsSync(path.join(candidate, 'package.json'))) return realpathSync(candidate);
    if (path.dirname(dir) === dir) return undefined;
  }
}

function readPackageJson(packageDir: string): JsonObject {
  try {
    const json: unknown = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
    return isObject(json) ? json : {};
  } catch {
    return {};
  }
}

function dependencyNames(packageJson: JsonObject): string[] {
  return DEPENDENCY_FIELDS.flatMap((field) => {
    const dependencies = packageJson[field];
    return isObject(dependencies) ? Object.keys(dependencies) : [];
  });
}
