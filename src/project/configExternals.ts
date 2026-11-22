import path from 'node:path';
import { isObject } from '../shared/guards.js';
import { toPosix } from '../shared/paths.js';
import { findSourceFile } from './sourcePaths.js';
import type { ConfigExternal, ConfigExternalSource, SpfxLibrary } from './types.js';

interface ExternalsLogger {
  warn: (message: string) => void;
}

interface ExternalEntry {
  path: string;
  globalName?: string;
  globalDependencies?: string[];
}

const REMOTE_URL = /^https?:/;
const LOCAL_SCRIPT_EXTENSIONS = ['.js'] as const;

export function readConfigExternals(
  root: string,
  externals: unknown,
  libraries: ReadonlyMap<string, SpfxLibrary>,
  logger: ExternalsLogger,
): Map<string, ConfigExternal> {
  const entries = new Map<string, ExternalEntry>();
  for (const [name, value] of Object.entries(isObject(externals) ? externals : {})) {
    const entry = readEntry(value);
    if (!entry) {
      logger.warn(`config/config.json externals "${name}": needs a path string or { "path", "globalName" }, skipped`);
    } else if (libraries.has(name)) {
      logger.warn(`config/config.json externals "${name}" is ignored: it is an SPFx library, loaded from SharePoint like in heft`);
    } else {
      entries.set(name, entry);
    }
  }

  const resolved = new Map<string, ConfigExternal | null>();
  const resolveExternal = (name: string, trail: readonly string[]): ConfigExternal | undefined => {
    if (resolved.has(name)) return resolved.get(name) ?? undefined;
    const entry = entries.get(name);
    if (!entry || trail.includes(name)) return undefined;
    const source = resolveSource(root, name, entry.path, logger);
    const missingDependency = source && entry.globalDependencies?.find((dependency) => !resolveExternal(dependency, [...trail, name]));
    if (missingDependency !== undefined) {
      logger.warn(
        `config/config.json externals "${name}": global dependency "${missingDependency}" is not a usable external ` +
          '(it must be a valid, non-circular entry in "externals" and must not be an SPFx library), skipped',
      );
    }
    const external = source && missingDependency === undefined ? toExternal(name, entry, source) : undefined;
    resolved.set(name, external ?? null);
    return external;
  };

  const result = new Map<string, ConfigExternal>();
  for (const name of entries.keys()) {
    const external = resolveExternal(name, []);
    if (external) result.set(name, external);
  }
  return result;
}

function readEntry(value: unknown): ExternalEntry | undefined {
  if (typeof value === 'string') return value === '' ? undefined : { path: value };
  if (!isObject(value) || typeof value.path !== 'string' || value.path === '') return undefined;
  const globalDependencies = Array.isArray(value.globalDependencies)
    ? value.globalDependencies.filter((dependency): dependency is string => typeof dependency === 'string')
    : [];
  return {
    path: value.path,
    ...(typeof value.globalName === 'string' && value.globalName !== '' ? { globalName: value.globalName } : {}),
    ...(globalDependencies.length > 0 ? { globalDependencies } : {}),
  };
}

function resolveSource(root: string, name: string, externalPath: string, logger: ExternalsLogger): ConfigExternalSource | undefined {
  if (REMOTE_URL.test(externalPath)) return { type: 'url', url: externalPath };
  const file = findSourceFile(root, externalPath, LOCAL_SCRIPT_EXTENSIONS);
  if (file) return { type: 'file', file };
  logger.warn(`config/config.json externals "${name}": ${toPosix(path.resolve(root, externalPath))} does not exist (paths are relative to the project root), skipped`);
  return undefined;
}

function toExternal(name: string, entry: ExternalEntry, source: ConfigExternalSource): ConfigExternal {
  return {
    name,
    source,
    ...(entry.globalName === undefined ? {} : { globalName: entry.globalName }),
    ...(entry.globalDependencies === undefined ? {} : { globalDependencies: entry.globalDependencies }),
  };
}
