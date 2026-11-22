import { existsSync } from 'node:fs';
import path from 'node:path';
import { FAST_SERVE_FOLDER } from '../config/index.js';
import { toPosix } from '../shared/paths.js';

const EXTEND_BASE_NAME = 'rspack.extend';
const EXTEND_EXTENSIONS = ['.mjs', '.mts', '.js', '.ts', '.cjs', '.cts'];

export const EXTEND_FILE = `${FAST_SERVE_FOLDER}/${EXTEND_BASE_NAME}.mjs`;

export function extendFileCandidates(root: string): string[] {
  return EXTEND_EXTENSIONS.map((extension) => path.join(root, FAST_SERVE_FOLDER, `${EXTEND_BASE_NAME}${extension}`));
}

export function findExtendFiles(root: string): string[] {
  return extendFileCandidates(root).filter((file) => existsSync(file));
}

export function findExtendFile(root: string): string | undefined {
  return findExtendFiles(root)[0];
}

export function projectRelative(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}
