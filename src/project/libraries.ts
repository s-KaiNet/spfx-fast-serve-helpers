import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { isObject, type JsonObject } from '../utils/guards.js';
import { readJsoncFile } from '../utils/jsonc.js';
import type { SpfxLibrary } from './types.js';

const MANIFEST_FILE = /^[^.\\/]+\.manifest\.json$/;
const DEPENDENCY_FIELDS = ['dependencies', 'devDependencies', 'optionalDependencies'] as const;

interface LibraryManifest {
  id: string;
  version: string;
  rootComponentId?: string;
}

export function findSpfxLibraries(root: string): Map<string, SpfxLibrary> {
  const libraries = new Map<string, SpfxLibrary>();
  const visited = new Set<string>();
  const projectJson = readPackageJson(root);
  const projectName = typeof projectJson.name === 'string' ? projectJson.name : undefined;
  const queue = dependencyNames(projectJson).map((packageName) => ({ packageName, fromDir: root }));

  for (let next = queue.shift(); next; next = queue.shift()) {
    const packageDir = findPackageDirectory(next.packageName, next.fromDir);
    if (!packageDir || visited.has(packageDir)) continue;
    visited.add(packageDir);
    const manifests = readDistManifests(packageDir);
    if (manifests.length === 0) continue;
    const library = singleLibraryManifest(manifests);
    if (library && next.packageName !== projectName && !libraries.has(next.packageName)) {
      libraries.set(next.packageName, { packageName: next.packageName, id: library.id, version: library.version, packageDir });
    }
    for (const packageName of dependencyNames(readPackageJson(packageDir))) queue.push({ packageName, fromDir: packageDir });
  }
  return libraries;
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
