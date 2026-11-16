import { existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isObject } from '../utils/guards.js';
import { readJsoncFile } from '../utils/jsonc.js';
import type { SpfxLibrary } from './types.js';

export function findSpfxLibraries(root: string, dependencies: readonly string[]): Map<string, SpfxLibrary> {
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  const libraries = new Map<string, SpfxLibrary>();
  for (const packageName of dependencies) {
    const distDir = path.join(packageDirectory(requireFromRoot, root, packageName), 'dist');
    if (!existsSync(distDir)) continue;
    for (const file of readdirSync(distDir)) {
      if (!file.endsWith('.manifest.json')) continue;
      const manifest = readJsoncFile(path.join(distDir, file));
      if (
        isObject(manifest) &&
        manifest.componentType === 'Library' &&
        typeof manifest.id === 'string' &&
        typeof manifest.version === 'string'
      ) {
        libraries.set(packageName, { packageName, id: manifest.id, version: manifest.version });
        break;
      }
    }
  }
  return libraries;
}

function packageDirectory(requireFromRoot: NodeJS.Require, root: string, packageName: string): string {
  try {
    return path.dirname(requireFromRoot.resolve(`${packageName}/package.json`));
  } catch {
    return path.join(root, 'node_modules', packageName);
  }
}
