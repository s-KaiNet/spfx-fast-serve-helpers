import { fileURLToPath } from 'node:url';

const REPO_ROOT_URL = new URL('../../', import.meta.url);

export function repoPath(relativePath = ''): string {
  return fileURLToPath(new URL(relativePath, REPO_ROOT_URL));
}

export function fixturePath(name: string): string {
  return repoPath(`test/fixtures/${name}`);
}

export function testWorkspace(): string {
  return repoPath('node_modules/.cache/fast-serve-tests/');
}
