import path from 'node:path';
import { isObject } from '../../shared/guards.js';
import type { LoadedTsconfig } from './tsconfig.js';

export interface PathMapping {
  readonly prefix: string;
  readonly suffix: string;
  readonly wildcard: boolean;
  readonly targets: readonly string[];
}

export interface TsconfigPaths {
  readonly files: readonly string[];
  readonly baseUrl?: string;
  readonly mappings: readonly PathMapping[];
}

interface ResolutionSettings {
  baseUrl?: string;
  mappings?: PathMapping[];
}

export function tsconfigPathsOf(tsconfig: LoadedTsconfig): TsconfigPaths {
  const settings = resolutionSettings(tsconfig);
  return {
    files: tsconfig.files,
    ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
    mappings: settings.mappings ?? [],
  };
}

function resolutionSettings({ layers }: LoadedTsconfig): ResolutionSettings {
  const settings: ResolutionSettings = {};
  for (const { file, compilerOptions } of layers) {
    const directory = path.dirname(file);
    if (typeof compilerOptions.baseUrl === 'string') settings.baseUrl = path.resolve(directory, compilerOptions.baseUrl);
    if (isObject(compilerOptions.paths)) settings.mappings = parseMappings(compilerOptions.paths);
  }
  return settings;
}

export function hasPathResolution(paths: TsconfigPaths): boolean {
  return paths.baseUrl !== undefined || paths.mappings.length > 0;
}

function parseMappings(paths: Record<string, unknown>): PathMapping[] {
  const mappings: PathMapping[] = [];
  for (const [pattern, value] of Object.entries(paths)) {
    const targets = Array.isArray(value) ? value.filter((target): target is string => typeof target === 'string') : [];
    const wildcards = pattern.split('*').length - 1;
    if (targets.length === 0 || wildcards > 1) continue;
    const [prefix = '', suffix = ''] = pattern.split('*');
    mappings.push({ prefix, suffix, wildcard: wildcards === 1, targets });
  }
  return mappings;
}
