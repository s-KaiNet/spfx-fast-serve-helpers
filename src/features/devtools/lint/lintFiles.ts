import path from 'node:path';
import { isInside } from '../../../shared/paths.js';

const LINTED_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);
const DECLARATION_FILE = /\.d\.[cm]?ts$/;

export interface SourceRoot {
  readonly root: string;
  readonly sourceDir: string;
}

export function isLintedFile(file: string): boolean {
  return LINTED_EXTENSIONS.has(path.extname(file)) && !DECLARATION_FILE.test(file) && !file.split(/[\\/]/).includes('node_modules');
}

export function sourceRootOf<T extends SourceRoot>(file: string, roots: readonly T[]): T | undefined {
  return roots.filter((root) => isInside(root.sourceDir, file) && file !== root.sourceDir).toSorted((first, second) => second.sourceDir.length - first.sourceDir.length)[0];
}
