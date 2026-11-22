import { readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { ESLINT_CONFIG_FILES } from './projectEslint.js';

const SETTLE_MS = 100;

export interface ConfigWatcher {
  close(): void;
}

function readOptional(file: string): string | undefined {
  try {
    return readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

export function watchEslintConfigs(roots: readonly string[], onChange: (file: string) => void, onError: (error: Error) => void): ConfigWatcher {
  const files = roots.flatMap((root) => ESLINT_CONFIG_FILES.map((name) => path.join(root, name)));
  const contents = new Map(files.map((file) => [file, readOptional(file)]));
  const watchers: FSWatcher[] = [];
  let timer: NodeJS.Timeout | undefined;
  const check = () => {
    timer = undefined;
    let firstChanged: string | undefined;
    for (const file of files) {
      const current = readOptional(file);
      if (current === contents.get(file)) continue;
      contents.set(file, current);
      firstChanged ??= file;
    }
    if (firstChanged !== undefined) onChange(firstChanged);
  };
  for (const root of new Set(roots)) {
    try {
      const watcher = watch(root, { persistent: false }, (_event, name) => {
        if (name !== null && ESLINT_CONFIG_FILES.includes(path.basename(name))) timer ??= setTimeout(check, SETTLE_MS);
      });
      watcher.on('error', onError);
      watchers.push(watcher);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
  return {
    close() {
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
