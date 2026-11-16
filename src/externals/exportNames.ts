import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';
import { isIdentifier, isObject } from '../utils/guards.js';

export async function readExportNames(root: string, packageName: string): Promise<string[]> {
  await init();
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  const names = new Set<string>();
  const esmEntry = findEsmEntry(requireFromRoot, packageName);
  if (esmEntry) collectEsmExports(esmEntry, names, new Set());
  if (names.size === 0) {
    const exported: unknown = requireFromRoot(packageName);
    if (isObject(exported)) Object.keys(exported).forEach((name) => names.add(name));
  }
  names.delete('default');
  return [...names].filter(isIdentifier).sort();
}

function findEsmEntry(requireFromRoot: NodeJS.Require, packageName: string): string | undefined {
  let packageJsonFile: string;
  try {
    packageJsonFile = requireFromRoot.resolve(`${packageName}/package.json`);
  } catch {
    return undefined;
  }
  const json: unknown = JSON.parse(readFileSync(packageJsonFile, 'utf8'));
  if (!isObject(json)) return undefined;
  const exportsField = isObject(json.exports) ? json.exports['.'] : undefined;
  const entry = typeof json.module === 'string' ? json.module : isObject(exportsField) ? exportsField.import : undefined;
  return typeof entry === 'string' ? path.join(path.dirname(packageJsonFile), entry) : undefined;
}

function collectEsmExports(file: string, names: Set<string>, seen: Set<string>): void {
  if (seen.has(file) || !existsSync(file)) return;
  seen.add(file);
  const [, exports] = parse(readFileSync(file, 'utf8'), file);
  for (const exported of exports) {
    if (exported.type !== 'reexport-all') {
      names.add(exported.name);
    } else if (exported.from.startsWith('.')) {
      const target = path.resolve(path.dirname(file), exported.from);
      collectEsmExports(path.extname(target) ? target : `${target}.js`, names, seen);
    }
  }
}
