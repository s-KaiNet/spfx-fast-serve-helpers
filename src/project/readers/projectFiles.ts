import { existsSync } from 'node:fs';
import path from 'node:path';
import { isObject, type JsonObject } from '../../shared/guards.js';
import { readJsoncFile, readOptionalJsoncFile } from '../../shared/jsonc.js';
import { SASS_CONFIG_FILE } from './sassConfiguration.js';
import { readServeConfigurations } from './serveConfigurations.js';
import type { PackageJson, ServeConfig } from '../types.js';

export interface ProjectFiles {
  readonly packageJson: string;
  readonly config: string;
  readonly serve: string;
  readonly tsconfig: string;
  readonly sass: string;
  readonly sourceDir: string;
}

export function projectFiles(root: string): ProjectFiles {
  return {
    packageJson: path.join(root, 'package.json'),
    config: path.join(root, 'config', 'config.json'),
    serve: path.join(root, 'config', 'serve.json'),
    tsconfig: path.join(root, 'tsconfig.json'),
    sass: path.join(root, SASS_CONFIG_FILE),
    sourceDir: path.join(root, 'src'),
  };
}

export function readPackageJson(file: string): PackageJson {
  const json = readJsoncFile(file);
  if (!isObject(json) || typeof json.version !== 'string') {
    throw new Error(`${file} has no "version"`);
  }
  return {
    name: typeof json.name === 'string' ? json.name : undefined,
    version: json.version,
    dependencies: stringRecord(json.dependencies),
    devDependencies: stringRecord(json.devDependencies),
  };
}

export function readBuildConfig(file: string): JsonObject {
  if (!existsSync(file)) throw new Error(`${file} not found. Run fast-serve in an SPFx project folder.`);
  const json = readJsoncFile(file);
  return isObject(json) ? json : {};
}

export function readServeConfig(file: string): ServeConfig {
  const json = readOptionalJsoncFile(file);
  if (!isObject(json)) return {};
  const serveConfigurations = readServeConfigurations(json.serveConfigurations);
  return {
    port: typeof json.port === 'number' ? json.port : undefined,
    initialPage: typeof json.initialPage === 'string' ? json.initialPage : undefined,
    ...(serveConfigurations === undefined ? {} : { serveConfigurations }),
  };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!isObject(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}
