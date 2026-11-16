import path from 'node:path';

export function toPosix(file: string): string {
  return file.split(path.sep).join('/');
}

export function toRootUrl(root: string, file: string): string {
  return '/' + toPosix(path.relative(root, file));
}

export function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}
