import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

export type RuntimeFile = 'componentShim' | 'themedStyles';

const cache = new Map<RuntimeFile, Promise<string>>();

export function readRuntimeSource(name: RuntimeFile): Promise<string> {
  let source = cache.get(name);
  if (!source) {
    source = loadRuntimeSource(name);
    cache.set(name, source);
  }
  return source;
}

export function runtimeFilePath(name: RuntimeFile): string {
  const compiled = fileURLToPath(new URL(`../runtime/${name}.js`, import.meta.url));
  return existsSync(compiled) ? compiled : fileURLToPath(new URL(`../runtime/${name}.ts`, import.meta.url));
}

async function loadRuntimeSource(name: RuntimeFile): Promise<string> {
  const file = runtimeFilePath(name);
  const code = readFileSync(file, 'utf8');
  if (file.endsWith('.js')) return code;
  const result = await transformWithOxc(code, file, { lang: 'ts' });
  return result.code;
}
