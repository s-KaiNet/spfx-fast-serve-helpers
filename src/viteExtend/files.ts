import { existsSync } from 'node:fs';
import path from 'node:path';
import { FAST_SERVE_FOLDER } from '../config/options.js';
import { toPosix } from '../utils/paths.js';

export const VITE_EXTEND_FILE = `${FAST_SERVE_FOLDER}/vite.extend.mts`;
const VITE_EXTEND_BASE_NAME = 'vite.extend';
const VITE_EXTEND_EXTENSIONS = ['.mts', '.ts', '.mjs', '.js', '.cjs'];

export function viteExtendCandidates(root: string): string[] {
  return VITE_EXTEND_EXTENSIONS.map((extension) => path.join(root, FAST_SERVE_FOLDER, `${VITE_EXTEND_BASE_NAME}${extension}`));
}

export function findViteExtendFile(root: string): string | undefined {
  return viteExtendCandidates(root).find((file) => existsSync(file));
}

export function isViteExtendCandidate(root: string, file: string): boolean {
  const normalized = toPosix(path.resolve(file));
  return viteExtendCandidates(root).some((candidate) => toPosix(candidate) === normalized);
}

export function projectRelative(root: string, file: string): string {
  return toPosix(path.relative(root, file));
}
