import { existsSync } from 'node:fs';
import path from 'node:path';
import { isObject } from '../shared/guards.js';
import { readJsoncFile } from '../shared/jsonc.js';

export const LIBRARY_COMPONENT_TYPE = 'Library';

export interface LibraryComponentSource {
  id: string;
  alias: string;
  version: string;
  manifestFile: string;
  entrypoint: string;
}

export function isOutsideNodeModules(realDir: string): boolean {
  return !realDir.split(/[\\/]/).includes('node_modules');
}

export function readLibraryComponent(projectDir: string, packageVersion: string): LibraryComponentSource | undefined {
  const configFile = path.join(projectDir, 'config', 'config.json');
  if (!existsSync(configFile)) return undefined;
  const config = readSafely(configFile);
  const bundles = isObject(config) && isObject(config.bundles) ? Object.values(config.bundles) : [];
  for (const bundle of bundles) {
    const components = isObject(bundle) && Array.isArray(bundle.components) ? bundle.components : [];
    for (const component of components) {
      const source = libraryComponentOf(projectDir, component, packageVersion);
      if (source) return source;
    }
  }
  return undefined;
}

function libraryComponentOf(projectDir: string, component: unknown, packageVersion: string): LibraryComponentSource | undefined {
  if (!isObject(component) || typeof component.manifest !== 'string' || typeof component.entrypoint !== 'string') return undefined;
  const manifestFile = path.resolve(projectDir, component.manifest);
  const manifest = readSafely(manifestFile);
  if (!isObject(manifest) || manifest.componentType !== LIBRARY_COMPONENT_TYPE || typeof manifest.id !== 'string') return undefined;
  const version = typeof manifest.version === 'string' && manifest.version !== '*' ? manifest.version : packageVersion;
  const alias = typeof manifest.alias === 'string' ? manifest.alias : manifest.id;
  return { id: manifest.id, alias, version, manifestFile, entrypoint: component.entrypoint };
}

function readSafely(file: string): unknown {
  try {
    return readJsoncFile(file);
  } catch {
    return undefined;
  }
}
