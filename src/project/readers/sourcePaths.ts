import { existsSync } from 'node:fs';
import path from 'node:path';
import { toPosix } from '../../shared/paths.js';

export const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'] as const;
export const LOC_EXTENSIONS = ['.js', '.ts'] as const;

export function findSourceFile(root: string, configPath: string, extensions: readonly string[]): string | undefined {
  const relative = toPosix(configPath).replace(/^\.\//, '');
  if (!relative.startsWith('lib/')) {
    const file = path.resolve(root, relative);
    return existsSync(file) ? file : undefined;
  }
  const base = 'src/' + relative.slice('lib/'.length).replace(/\.js$/, '');
  for (const extension of extensions) {
    const candidate = path.resolve(root, base + extension);
    if (existsSync(candidate)) return candidate;
  }
  return undefined;
}
