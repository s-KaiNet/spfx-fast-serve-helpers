import { existsSync } from 'node:fs';
import path from 'node:path';
import { isObject } from '../utils/guards.js';
import { readOptionalJsoncFile } from '../utils/jsonc.js';
import { toPosix } from '../utils/paths.js';

export const CUSTOMIZE_WEBPACK_FILE = 'config/spfx-customize-webpack.js';
export const WEBPACK_PATCH_FILE = 'config/webpack-patch.json';

export function findWebpackCustomizations(root: string): string[] {
  const files: string[] = [];
  if (existsSync(path.join(root, CUSTOMIZE_WEBPACK_FILE))) files.push(CUSTOMIZE_WEBPACK_FILE);
  if (existsSync(path.join(root, WEBPACK_PATCH_FILE))) files.push(WEBPACK_PATCH_FILE, ...patchFiles(root));
  return files;
}

function patchFiles(root: string): string[] {
  let json: unknown;
  try {
    json = readOptionalJsoncFile(path.join(root, WEBPACK_PATCH_FILE));
  } catch {
    return [];
  }
  if (!isObject(json) || !Array.isArray(json.patchFiles)) return [];
  return json.patchFiles
    .filter((file): file is string => typeof file === 'string')
    .map((file) => path.resolve(root, file))
    .filter((file) => existsSync(file))
    .map((file) => toPosix(path.relative(root, file)));
}
