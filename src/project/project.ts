import { existsSync } from 'node:fs';
import path from 'node:path';
import { isObject, type JsonObject } from '../utils/guards.js';
import { readJsoncFile, readOptionalJsoncFile } from '../utils/jsonc.js';
import { isInside, toPosix } from '../utils/paths.js';
import { findSpfxLibraries } from './libraries.js';
import { findSourceFile, LOC_EXTENSIONS, SOURCE_EXTENSIONS } from './sourcePaths.js';
import type {
  ComponentManifest,
  LocalizedResource,
  PackageJson,
  ServeConfig,
  SpfxBundle,
  SpfxComponent,
  SpfxLibrary,
} from './types.js';

export const DEFAULT_LOCALE = 'en-us';

export interface ProjectLogger {
  warn: (message: string) => void;
}

export interface SpfxProject {
  readonly root: string;
  packageJson(): PackageJson;
  serveConfig(): ServeConfig;

  bundles(): SpfxBundle[];

  components(): SpfxComponent[];

  libraries(): Map<string, SpfxLibrary>;

  localizedResources(locale: string): Map<string, LocalizedResource>;

  modelFiles(): string[];

  invalidate(file: string): boolean;
}

const SUPPORTED_COMPONENT_TYPES = new Set(['WebPart']);

export function createProject(root: string, logger: ProjectLogger): SpfxProject {
  const files = {
    packageJson: path.join(root, 'package.json'),
    config: path.join(root, 'config', 'config.json'),
    serve: path.join(root, 'config', 'serve.json'),
  };
  const sourceDir = path.join(root, 'src');
  const cache = new Map<string, unknown>();

  function cached<T>(key: string, compute: () => T): T {
    if (!cache.has(key)) cache.set(key, compute());
    return cache.get(key) as T;
  }

  const packageJson = (): PackageJson =>
    cached('packageJson', () => {
      const json = readJsoncFile(files.packageJson);
      if (!isObject(json) || typeof json.version !== 'string') {
        throw new Error(`${files.packageJson} has no "version"`);
      }
      return {
        name: typeof json.name === 'string' ? json.name : undefined,
        version: json.version,
        dependencies: stringRecord(json.dependencies),
        devDependencies: stringRecord(json.devDependencies),
      };
    });

  const buildConfig = (): JsonObject =>
    cached('config', () => {
      if (!existsSync(files.config)) throw new Error(`${files.config} not found. Run fast-serve in an SPFx project folder.`);
      const json = readJsoncFile(files.config);
      return isObject(json) ? json : {};
    });

  const serveConfig = (): ServeConfig =>
    cached('serve', () => {
      const json = readOptionalJsoncFile(files.serve);
      if (!isObject(json)) return {};
      return {
        port: typeof json.port === 'number' ? json.port : undefined,
        initialPage: typeof json.initialPage === 'string' ? json.initialPage : undefined,
      };
    });

  const bundles = (): SpfxBundle[] =>
    cached('bundles', () => {
      const config = buildConfig();
      if (isObject(config.externals) && Object.keys(config.externals).length > 0) {
        logger.warn('config/config.json "externals" are not supported yet and are ignored');
      }
      const result: SpfxBundle[] = [];
      for (const [name, bundle] of Object.entries(isObject(config.bundles) ? config.bundles : {})) {
        const entries = isObject(bundle) && Array.isArray(bundle.components) ? bundle.components : [];
        const components = entries.flatMap((entry) => readComponent(name, entry));
        if (components.length > 0) result.push({ name, components });
      }
      return result;
    });

  function readComponent(bundleName: string, entry: unknown): SpfxComponent[] {
    if (!isObject(entry) || typeof entry.manifest !== 'string' || typeof entry.entrypoint !== 'string') {
      logger.warn(`config/config.json bundle "${bundleName}": a component without "manifest"/"entrypoint" is skipped`);
      return [];
    }
    const manifestFile = path.resolve(root, entry.manifest);
    const manifest = readManifest(manifestFile, packageJson().version);
    if (!SUPPORTED_COMPONENT_TYPES.has(manifest.componentType)) {
      logger.warn(`${manifest.alias}: componentType "${manifest.componentType}" is not supported yet, skipped`);
      return [];
    }
    const entryFile = findSourceFile(root, entry.entrypoint, SOURCE_EXTENSIONS);
    if (!entryFile) {
      throw new Error(`Cannot find the source of "${entry.entrypoint}" (${manifest.alias}) under src/`);
    }
    return [{ bundleName, manifest, manifestFile, entryFile }];
  }

  const libraries = (): Map<string, SpfxLibrary> =>
    cached('libraries', () => findSpfxLibraries(root));

  const localizedResources = (locale: string): Map<string, LocalizedResource> =>
    cached(`loc:${locale}`, () => {
      const config = buildConfig();
      const result = new Map<string, LocalizedResource>();
      for (const [name, pattern] of Object.entries(isObject(config.localizedResources) ? config.localizedResources : {})) {
        if (typeof pattern !== 'string') continue;
        const resource = resolveLocalizedResource(name, pattern, locale);
        if (resource) result.set(name, resource);
      }
      return result;
    });

  function resolveLocalizedResource(name: string, pattern: string, locale: string): LocalizedResource | undefined {
    const candidates = locale === DEFAULT_LOCALE ? [locale] : [locale, DEFAULT_LOCALE];
    for (const candidate of candidates) {
      const file = findSourceFile(root, pattern.replace('{locale}', candidate), LOC_EXTENSIONS);
      if (!file) continue;
      if (candidate !== locale) logger.warn(`${name}: no "${locale}" strings, using ${candidate}`);
      return { name, file, locale: candidate };
    }
    logger.warn(`${name}: no strings file found for "${pattern}"`);
    return undefined;
  }

  const components = (): SpfxComponent[] => bundles().flatMap((bundle) => bundle.components);

  return {
    root,
    packageJson,
    serveConfig,
    bundles,
    components,
    libraries,
    localizedResources,
    modelFiles: () => [files.packageJson, files.config, files.serve, ...components().map((c) => c.manifestFile)],
    invalidate(file) {
      const changed = path.resolve(file);
      if (changed === files.packageJson || changed === files.config) {
        cache.clear();
        return true;
      }
      if (changed === files.serve) {
        cache.delete('serve');
        return true;
      }
      if (changed.endsWith('.manifest.json') && isInside(sourceDir, changed)) {
        cache.delete('bundles');
        return true;
      }
      return false;
    },
  };
}

function readManifest(file: string, packageVersion: string): ComponentManifest {
  const json = readJsoncFile(file);
  if (!isObject(json) || typeof json.id !== 'string' || typeof json.componentType !== 'string') {
    throw new Error(`${toPosix(file)} is not a component manifest (needs "id" and "componentType")`);
  }
  const alias = typeof json.alias === 'string' ? json.alias : json.id;
  const version = typeof json.version === 'string' && json.version !== '*' ? json.version : packageVersion;
  return { ...json, id: json.id, alias, componentType: json.componentType, version };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
