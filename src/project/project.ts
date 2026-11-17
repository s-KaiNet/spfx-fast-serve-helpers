import { existsSync } from 'node:fs';
import path from 'node:path';
import { isObject, type JsonObject } from '../utils/guards.js';
import { readJsoncFile, readOptionalJsoncFile } from '../utils/jsonc.js';
import { isInside, toPosix } from '../utils/paths.js';
import { bundleExportNames } from './exportNames.js';
import { findSpfxLibraries } from './libraries.js';
import { findSourceFile, LOC_EXTENSIONS, SOURCE_EXTENSIONS } from './sourcePaths.js';
import { hasPathResolution, readTsconfigPaths, type TsconfigPaths } from './tsconfigPaths.js';
import { readConfigExternals } from './configExternals.js';
import type {
  ComponentManifest,
  ConfigExternal,
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

export type ProjectChange = 'model' | 'tsconfig';

export interface SpfxProject {
  readonly root: string;
  packageJson(): PackageJson;
  serveConfig(): ServeConfig;

  bundles(): SpfxBundle[];

  components(): SpfxComponent[];

  libraries(): Map<string, SpfxLibrary>;

  configExternals(): Map<string, ConfigExternal>;

  localizedResources(locale: string): Map<string, LocalizedResource>;

  tsconfigPaths(): TsconfigPaths | undefined;

  modelFiles(): string[];

  invalidate(file: string): ProjectChange | undefined;
}

const SUPPORTED_COMPONENT_TYPES = new Set(['WebPart']);

export function createProject(root: string, logger: ProjectLogger): SpfxProject {
  const files = {
    packageJson: path.join(root, 'package.json'),
    config: path.join(root, 'config', 'config.json'),
    serve: path.join(root, 'config', 'serve.json'),
    tsconfig: path.join(root, 'tsconfig.json'),
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
      const result: SpfxBundle[] = [];
      for (const [name, bundle] of Object.entries(isObject(config.bundles) ? config.bundles : {})) {
        const entries = isObject(bundle) && Array.isArray(bundle.components) ? bundle.components : [];
        const components = withExportNames(entries.flatMap((entry) => readComponentEntry(name, entry)))
          .filter(isSupported)
          .map((componentEntry) => toComponent(name, componentEntry));
        if (components.length > 0) result.push({ name, components });
      }
      return result;
    });

  function readComponentEntry(bundleName: string, entry: unknown): ComponentEntry[] {
    if (!isObject(entry) || typeof entry.manifest !== 'string' || typeof entry.entrypoint !== 'string') {
      logger.warn(`config/config.json bundle "${bundleName}": a component without "manifest"/"entrypoint" is skipped`);
      return [];
    }
    const manifestFile = path.resolve(root, entry.manifest);
    return [{ manifest: readManifest(manifestFile, packageJson().version), manifestFile, entrypoint: entry.entrypoint }];
  }

  function isSupported({ manifest }: ComponentEntry): boolean {
    if (SUPPORTED_COMPONENT_TYPES.has(manifest.componentType)) return true;
    logger.warn(`${manifest.alias}: componentType "${manifest.componentType}" is not supported yet, skipped`);
    return false;
  }

  function toComponent(bundleName: string, { manifest, manifestFile, entrypoint, exportName }: ComponentEntry): SpfxComponent {
    const entryFile = findSourceFile(root, entrypoint, SOURCE_EXTENSIONS);
    if (!entryFile) {
      throw new Error(`Cannot find the source of "${entrypoint}" (${manifest.alias}) under src/`);
    }
    return { bundleName, manifest, manifestFile, entryFile, ...(exportName === undefined ? {} : { exportName }) };
  }

  const libraries = (): Map<string, SpfxLibrary> =>
    cached('libraries', () => findSpfxLibraries(root));

  const configExternals = (): Map<string, ConfigExternal> =>
    cached('externals', () => readConfigExternals(root, buildConfig().externals, libraries(), logger));

  const localFileExternals = (): string[] =>
    [...configExternals().values()].flatMap(({ source }) => (source.type === 'file' ? [source.file] : []));

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
      const file = findSourceFile(root, pattern.replaceAll('{locale}', candidate), LOC_EXTENSIONS);
      if (!file) continue;
      if (candidate !== locale) logger.warn(`${name}: no "${locale}" strings, using ${candidate}`);
      return { name, file, locale: candidate };
    }
    logger.warn(`${name}: no strings file found for "${pattern}"`);
    return undefined;
  }

  const tsconfigPaths = (): TsconfigPaths | undefined =>
    cached('tsconfig', () => {
      if (!existsSync(files.tsconfig)) return undefined;
      try {
        return readTsconfigPaths(files.tsconfig);
      } catch (error) {
        logger.warn(`tsconfig.json "paths" and "baseUrl" are ignored: ${error instanceof Error ? error.message : String(error)}`);
        return undefined;
      }
    });

  const tsconfigFiles = (): readonly string[] => tsconfigPaths()?.files ?? [files.tsconfig];

  const components = (): SpfxComponent[] => bundles().flatMap((bundle) => bundle.components);

  return {
    root,
    packageJson,
    serveConfig,
    bundles,
    components,
    libraries,
    configExternals,
    localizedResources,
    tsconfigPaths: () => {
      const paths = tsconfigPaths();
      return paths && hasPathResolution(paths) ? paths : undefined;
    },
    modelFiles: () => [
      files.packageJson,
      files.config,
      files.serve,
      ...components().map((c) => c.manifestFile),
      ...tsconfigFiles(),
      ...localFileExternals(),
    ],
    invalidate(file) {
      const changed = path.resolve(file);
      if (tsconfigFiles().includes(changed)) {
        cache.delete('tsconfig');
        return 'tsconfig';
      }
      if (changed === files.packageJson || changed === files.config) {
        cache.clear();
        return 'model';
      }
      if (changed === files.serve) {
        cache.delete('serve');
        return 'model';
      }
      if (localFileExternals().includes(changed)) {
        cache.delete('externals');
        return 'model';
      }
      if (changed.endsWith('.manifest.json') && isInside(sourceDir, changed)) {
        cache.delete('bundles');
        return 'model';
      }
      return undefined;
    },
  };
}

interface ComponentEntry {
  manifest: ComponentManifest;
  manifestFile: string;
  entrypoint: string;
  exportName?: string;
}

function withExportNames(entries: ComponentEntry[]): ComponentEntry[] {
  const uniqueComponents = [...new Map(entries.map((entry) => [entry.manifest.id, entry])).values()];
  if (uniqueComponents.length < 2) return uniqueComponents;
  const exportNames = bundleExportNames(uniqueComponents.length);
  for (const [index, entry] of uniqueComponents.entries()) entry.exportName = exportNames[index];
  return uniqueComponents;
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
