import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { isObject, type JsonObject } from '../utils/guards.js';
import { errorMessage } from '../utils/errors.js';
import { readJsoncFile } from '../utils/jsonc.js';
import type { ProjectLogger } from './types.js';

export interface TsconfigLayer {
  readonly file: string;
  readonly compilerOptions: JsonObject;
}

export interface LoadedTsconfig {
  readonly file: string;
  readonly files: readonly string[];
  readonly layers: readonly TsconfigLayer[];
}

export function loadTsconfig(tsconfigFile: string): LoadedTsconfig {
  const file = path.resolve(tsconfigFile);
  const files: string[] = [];
  const layers: TsconfigLayer[] = [];
  collectLayers(file, files, layers);
  return { file, files, layers };
}

export function mergedCompilerOptions({ layers }: LoadedTsconfig): JsonObject {
  return Object.assign({}, ...layers.map((layer) => layer.compilerOptions)) as JsonObject;
}

function collectLayers(file: string, files: string[], layers: TsconfigLayer[]): void {
  if (files.includes(file)) throw new Error(`Circular "extends" in ${file}`);
  files.push(file);
  const json = readJsoncFile(file);
  if (!isObject(json)) return;
  for (const extended of extendsList(json.extends)) collectLayers(resolveExtends(extended, file), files, layers);
  layers.push({ file, compilerOptions: isObject(json.compilerOptions) ? json.compilerOptions : {} });
}

function extendsList(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function resolveExtends(extended: string, fromFile: string): string {
  if (path.isAbsolute(extended) || /^\.\.?(?:[\\/]|$)/.test(extended)) {
    const file = path.resolve(path.dirname(fromFile), extended);
    if (existsSync(file)) return file;
    if (!file.endsWith('.json') && existsSync(`${file}.json`)) return `${file}.json`;
    throw new Error(`${fromFile} extends "${extended}", which does not exist`);
  }
  const requireFromConfig = createRequire(fromFile);
  for (const request of [extended, `${extended}.json`, `${extended}/tsconfig.json`]) {
    try {
      const resolved = requireFromConfig.resolve(request);
      if (resolved.endsWith('.json')) return resolved;
    } catch {
      continue;
    }
  }
  throw new Error(`${fromFile} extends "${extended}", which cannot be resolved`);
}

export function readProjectTsconfig(tsconfigFile: string, logger: ProjectLogger): LoadedTsconfig | undefined {
  if (!existsSync(tsconfigFile)) return undefined;
  try {
    return loadTsconfig(tsconfigFile);
  } catch (error) {
    logger.warn(`tsconfig.json is ignored: ${errorMessage(error)}`);
    return undefined;
  }
}
