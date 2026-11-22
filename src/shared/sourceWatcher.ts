import { existsSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

export interface SourceChange {
  file: string;
  exists: boolean;
}

export type SourceChangeListener = (changes: SourceChange[]) => void;

export interface SourceWatcher {
  close(): void;
}

const SETTLE_MS = 50;

export function watchSourceFolder(folder: string, listener: SourceChangeListener, onError: (error: Error) => void): SourceWatcher {
  if (!existsSync(folder)) return { close: () => undefined };
  const pending = new Set<string>();
  let timer: NodeJS.Timeout | undefined;
  const flush = () => {
    timer = undefined;
    const files = [...pending];
    pending.clear();
    listener(files.map((file) => ({ file, exists: existsSync(file) })));
  };
  let watcher: FSWatcher | undefined;
  try {
    watcher = watch(folder, { recursive: true, persistent: false }, (_event, name) => {
      if (name === null) return;
      pending.add(path.join(folder, name));
      timer ??= setTimeout(flush, SETTLE_MS);
    });
    watcher.on('error', onError);
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)));
  }
  return {
    close() {
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
}
