import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { transformWithOxc } from 'vite';

export type RuntimeScript = 'componentShim' | 'libraryLoader';
export type RuntimeFile = RuntimeScript | 'describeError' | 'themedStyles';

const SCRIPT_HELPERS: readonly RuntimeFile[] = ['describeError'];

const cache = new Map<RuntimeFile, Promise<string>>();

export function readRuntimeSource(name: RuntimeFile): Promise<string> {
  let source = cache.get(name);
  if (!source) {
    source = loadRuntimeSource(name);
    cache.set(name, source);
  }
  return source;
}

export async function readRuntimeScript(name: RuntimeScript): Promise<string> {
  const sources = await Promise.all([...SCRIPT_HELPERS, name].map(readRuntimeSource));
  return sources.map((source) => source.trim()).join('\n');
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
