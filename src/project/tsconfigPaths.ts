import path from 'node:path';
import { isObject } from '../utils/guards.js';
import { loadTsconfig, type LoadedTsconfig } from './tsconfig.js';

export interface PathMapping {
  readonly prefix: string;
  readonly suffix: string;
  readonly wildcard: boolean;
  readonly targets: readonly string[];
}

export interface TsconfigPaths {
  readonly files: readonly string[];
  readonly baseUrl?: string;
  readonly pathsBase: string;
  readonly mappings: readonly PathMapping[];
}

interface ResolutionSettings {
  baseUrl?: string;
  paths?: { mappings: PathMapping[]; declaredIn: string };
}

export function readTsconfigPaths(tsconfigFile: string): TsconfigPaths {
  return tsconfigPathsOf(loadTsconfig(tsconfigFile));
}

export function tsconfigPathsOf(tsconfig: LoadedTsconfig): TsconfigPaths {
  const settings = resolutionSettings(tsconfig);
  return {
    files: tsconfig.files,
    ...(settings.baseUrl === undefined ? {} : { baseUrl: settings.baseUrl }),
    pathsBase: settings.baseUrl ?? settings.paths?.declaredIn ?? path.dirname(tsconfig.file),
    mappings: settings.paths?.mappings ?? [],
  };
}

function resolutionSettings({ layers }: LoadedTsconfig): ResolutionSettings {
  const settings: ResolutionSettings = {};
  for (const { file, compilerOptions } of layers) {
    const directory = path.dirname(file);
    if (typeof compilerOptions.baseUrl === 'string') settings.baseUrl = path.resolve(directory, compilerOptions.baseUrl);
    if (isObject(compilerOptions.paths)) settings.paths = { mappings: parseMappings(compilerOptions.paths), declaredIn: directory };
  }
  return settings;
}

export function hasPathResolution(paths: TsconfigPaths): boolean {
  return paths.baseUrl !== undefined || paths.mappings.length > 0;
}

export function aliasCandidates(paths: TsconfigPaths, specifier: string): string[] {
  if (!isBareSpecifier(specifier)) return [];
  const candidates: string[] = [];
  const mapping = bestMapping(paths.mappings, specifier);
  if (mapping) {
    const matched = mapping.wildcard ? specifier.slice(mapping.prefix.length, specifier.length - mapping.suffix.length) : '';
    for (const target of mapping.targets) {
      candidates.push(path.resolve(paths.pathsBase, mapping.wildcard ? target.replace('*', matched) : target));
    }
  }
  if (paths.baseUrl !== undefined) candidates.push(path.resolve(paths.baseUrl, specifier));
  return candidates;
}

export function matchesPathAlias(paths: TsconfigPaths, specifier: string): boolean {
  if (!isBareSpecifier(specifier)) return false;
  const mapping = bestMapping(paths.mappings, specifier);
  return mapping !== undefined && !isCatchAll(mapping);
}

function isCatchAll(mapping: PathMapping): boolean {
  return mapping.wildcard && mapping.prefix === '' && mapping.suffix === '';
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

function bestMapping(mappings: readonly PathMapping[], specifier: string): PathMapping | undefined {
  const exact = mappings.find((mapping) => !mapping.wildcard && mapping.prefix === specifier);
  if (exact) return exact;
  let best: PathMapping | undefined;
  for (const mapping of mappings) {
    if (!mapping.wildcard || !matchesWildcard(mapping, specifier)) continue;
    if (!best || mapping.prefix.length > best.prefix.length) best = mapping;
  }
  return best;
}

function matchesWildcard({ prefix, suffix }: PathMapping, specifier: string): boolean {
  return specifier.length >= prefix.length + suffix.length && specifier.startsWith(prefix) && specifier.endsWith(suffix);
}

function isBareSpecifier(specifier: string): boolean {
  return specifier !== '' && !/^\.\.?(?:[\\/]|$)/.test(specifier) && !path.isAbsolute(specifier) && !specifier.startsWith('/') && !specifier.includes('\0') && !/^[\w+.-]+:/.test(specifier);
}
