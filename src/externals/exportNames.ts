import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';
import { init, parse } from 'es-module-lexer';
import { isIdentifier, isObject, type JsonObject } from '../utils/guards.js';

const EVALUATION_TIMEOUT_MS = 2000;

export async function readExportNames(packageDir: string): Promise<string[]> {
  await init();
  const packageJson = readPackageJson(packageDir);
  const esmEntry = resolveEntry(packageDir, esmEntryField(packageJson));
  const names = new Set<string>();
  if (esmEntry) collectEsmExports(esmEntry, names, new Set());
  if (names.size === 0) {
    const scriptEntry = esmEntry ?? resolveEntry(packageDir, typeof packageJson.main === 'string' ? packageJson.main : 'index.js');
    if (scriptEntry) evaluateScriptExports(scriptEntry).forEach((name) => names.add(name));
  }
  names.delete('default');
  return [...names].filter(isIdentifier).toSorted();
}

function readPackageJson(packageDir: string): JsonObject {
  const json: unknown = JSON.parse(readFileSync(path.join(packageDir, 'package.json'), 'utf8'));
  return isObject(json) ? json : {};
}

function esmEntryField(packageJson: JsonObject): string | undefined {
  if (typeof packageJson.module === 'string') return packageJson.module;
  const rootExport = isObject(packageJson.exports) ? packageJson.exports['.'] : undefined;
  if (!isObject(rootExport)) return undefined;
  const importCondition = rootExport.import;
  if (typeof importCondition === 'string') return importCondition;
  return isObject(importCondition) && typeof importCondition.default === 'string' ? importCondition.default : undefined;
}

function resolveEntry(packageDir: string, entry: string | undefined): string | undefined {
  if (entry === undefined) return undefined;
  const file = path.join(packageDir, entry);
  return [file, `${file}.js`, path.join(file, 'index.js')].find((candidate) => existsSync(candidate) && statSync(candidate).isFile());
}

function collectEsmExports(file: string, names: Set<string>, seen: Set<string>): void {
  if (seen.has(file) || !existsSync(file)) return;
  seen.add(file);
  let exports;
  try {
    [, exports] = parse(readFileSync(file, 'utf8'), file);
  } catch {
    return;
  }
  for (const exported of exports) {
    if (exported.type !== 'reexport-all') {
      names.add(exported.name);
    } else if (exported.from.startsWith('.')) {
      const target = path.resolve(path.dirname(file), exported.from);
      collectEsmExports(path.extname(target) ? target : `${target}.js`, names, seen);
    }
  }
}

function evaluateScriptExports(file: string): string[] {
  const module: { exports: unknown } = { exports: {} };
  const define = Object.assign(
    (...args: unknown[]) => {
      const factory = args.find((arg): arg is () => unknown => typeof arg === 'function');
      module.exports = factory ? factory() : args.find(isObject);
    },
    { amd: true },
  );
  runInNewContext(readFileSync(file, 'utf8'), { module, exports: module.exports, define }, {
    filename: file,
    timeout: EVALUATION_TIMEOUT_MS,
  });
  return isObject(module.exports) || typeof module.exports === 'function' ? Object.keys(module.exports) : [];
}
