import { createHash } from 'node:crypto';
import { existsSync, readFileSync, watch, type FSWatcher } from 'node:fs';
import path from 'node:path';

export interface FileChange {
  file: string;
  exists: boolean;
}

export interface FileWatcher {
  add(files: readonly string[]): void;
  close(): void;
}

export interface WatchFilesOptions {
  onChange: (changes: FileChange[]) => void;
  onError: (error: Error) => void;
  settleMs?: number;
}

const DEFAULT_SETTLE_MS = 100;

export function fileSignature(file: string): string | undefined {
  try {
    return createHash('sha1').update(readFileSync(file)).digest('hex');
  } catch {
    return undefined;
  }
}

function nearestExistingFolder(file: string): string {
  let folder = path.dirname(file);
  while (!existsSync(folder) && path.dirname(folder) !== folder) folder = path.dirname(folder);
  return folder;
}

export function watchFiles(files: readonly string[], { onChange, onError, settleMs = DEFAULT_SETTLE_MS }: WatchFilesOptions): FileWatcher {
  const signatures = new Map<string, string | undefined>();
  const folders = new Map<string, FSWatcher>();
  let timer: NodeJS.Timeout | undefined;
  let closed = false;

  const watchFolder = (folder: string) => {
    if (folders.has(folder) || closed) return;
    try {
      const watcher = watch(folder, { persistent: false }, () => {
        timer ??= setTimeout(check, settleMs);
      });
      watcher.on('error', (error) => {
        folders.delete(folder);
        watcher.close();
        onError(error);
      });
      folders.set(folder, watcher);
    } catch (error) {
      onError(error instanceof Error ? error : new Error(String(error)));
    }
  };

  const syncFolders = () => {
    for (const file of signatures.keys()) watchFolder(nearestExistingFolder(file));
  };

  const check = () => {
    timer = undefined;
    if (closed) return;
    const changes: FileChange[] = [];
    for (const [file, previous] of signatures) {
      const current = fileSignature(file);
      if (current === previous) continue;
      signatures.set(file, current);
      changes.push({ file, exists: current !== undefined });
    }
    syncFolders();
    if (changes.length > 0) onChange(changes);
  };

  const add = (added: readonly string[]) => {
    for (const file of added.map((entry) => path.resolve(entry))) {
      if (!signatures.has(file)) signatures.set(file, fileSignature(file));
    }
    syncFolders();
  };

  add(files);
  return {
    add,
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      for (const watcher of folders.values()) watcher.close();
      folders.clear();
    },
  };
}
