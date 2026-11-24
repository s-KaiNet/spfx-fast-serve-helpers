import path from 'node:path';
import { isObject, type JsonObject } from '../../shared/guards.js';
import { readJsoncFile } from '../../shared/jsonc.js';
import { toPosix } from '../../shared/paths.js';
import { bundleExportNames } from '../exportNames.js';
import { LIBRARY_COMPONENT_TYPE } from './localLibraries.js';
import { findSourceFile, SOURCE_EXTENSIONS } from './sourcePaths.js';
import type { ComponentManifest, ProjectLogger, SpfxBundle, SpfxComponent } from '../types.js';

const SUPPORTED_COMPONENT_TYPES = new Set(['WebPart', 'Extension', 'AdaptiveCardExtension', LIBRARY_COMPONENT_TYPE]);

interface ComponentEntry {
  manifest: ComponentManifest;
  manifestFile: string;
  entrypoint: string;
  exportName?: string;
}

export interface BundleSource {
  readonly root: string;
  readonly config: JsonObject;
  readonly packageVersion: () => string;
  readonly logger: ProjectLogger;
}

export function readBundles(source: BundleSource): SpfxBundle[] {
  const { config } = source;
  const result: SpfxBundle[] = [];
  for (const [name, bundle] of Object.entries(isObject(config.bundles) ? config.bundles : {})) {
    const entries = isObject(bundle) && Array.isArray(bundle.components) ? bundle.components : [];
    const components = withExportNames(entries.flatMap((entry) => readComponentEntry(source, name, entry)))
      .filter((entry) => isSupported(entry, source.logger))
      .map((entry) => toComponent(source.root, name, entry));
    if (components.length > 0) result.push({ name, components });
  }
  return result;
}

function readComponentEntry({ root, packageVersion, logger }: BundleSource, bundleName: string, entry: unknown): ComponentEntry[] {
  if (!isObject(entry) || typeof entry.manifest !== 'string' || typeof entry.entrypoint !== 'string') {
    logger.warn(`config/config.json bundle "${bundleName}": a component without "manifest"/"entrypoint" is skipped`);
    return [];
  }
  const manifestFile = path.resolve(root, entry.manifest);
  return [{ manifest: readManifest(manifestFile, packageVersion()), manifestFile, entrypoint: entry.entrypoint }];
}

function isSupported({ manifest }: ComponentEntry, logger: ProjectLogger): boolean {
  if (SUPPORTED_COMPONENT_TYPES.has(manifest.componentType)) return true;
  logger.warn(`${manifest.alias}: componentType "${manifest.componentType}" is not supported by fast-serve, skipped (its bundle is not built or listed in the debug manifests)`);
  return false;
}

function toComponent(root: string, bundleName: string, { manifest, manifestFile, entrypoint, exportName }: ComponentEntry): SpfxComponent {
  const entryFile = findSourceFile(root, entrypoint, SOURCE_EXTENSIONS);
  if (!entryFile) {
    throw new Error(`Cannot find the source of "${entrypoint}" (${manifest.alias}) under src/`);
  }
  return { bundleName, manifest, manifestFile, entryFile, ...(exportName === undefined ? {} : { exportName }) };
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
  if (json.componentType === 'Extension' && typeof json.extensionType !== 'string') {
    throw new Error(`${toPosix(file)}: an "Extension" manifest needs "extensionType"`);
  }
  return { ...json, id: json.id, alias, componentType: json.componentType, version };
}
