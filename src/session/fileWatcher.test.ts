import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { watchFiles, type FileChange, type FileWatcher } from './fileWatcher.js';

const SETTLE_MS = 30;
let root: string;
let watcher: FileWatcher | undefined;

afterEach(() => {
  watcher?.close();
  rmSync(root, { recursive: true, force: true });
});

function nextChanges(changes: FileChange[][], count: number, timeoutMs = 3000): Promise<FileChange[][]> {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const poll = () => {
      if (changes.length >= count) resolve(changes);
      else if (Date.now() - startedAt > timeoutMs) reject(new Error(`expected ${count} change batches, got ${JSON.stringify(changes)}`));
      else setTimeout(poll, 10);
    };
    poll();
  });
}

const settle = () =>
  new Promise((resolve) => {
    setTimeout(resolve, SETTLE_MS * 4);
  });

describe('watchFiles', () => {
  it('reports content changes, atomic saves, deletions and files in folders created later', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-watch-'));
    mkdirSync(path.join(root, 'config'));
    writeFileSync(path.join(root, 'config/config.json'), '{}');
    const changes: FileChange[][] = [];
    watcher = watchFiles([path.join(root, 'config/config.json'), path.join(root, 'fast-serve/rspack.extend.mjs')], {
      onChange: (batch) => changes.push(batch),
      onError: (error) => {
        throw error;
      },
      settleMs: SETTLE_MS,
    });

    writeFileSync(path.join(root, 'config/config.json'), '{ "a": 1 }');
    await nextChanges(changes, 1);
    expect(changes[0]).toEqual([{ file: path.join(root, 'config/config.json'), exists: true }]);

    writeFileSync(path.join(root, 'config/config.json.tmp'), '{ "a": 2 }');
    renameSync(path.join(root, 'config/config.json.tmp'), path.join(root, 'config/config.json'));
    await nextChanges(changes, 2);

    mkdirSync(path.join(root, 'fast-serve'));
    await settle();
    writeFileSync(path.join(root, 'fast-serve/rspack.extend.mjs'), 'export default {};');
    await nextChanges(changes, 3);
    expect(changes[2]).toEqual([{ file: path.join(root, 'fast-serve/rspack.extend.mjs'), exists: true }]);

    rmSync(path.join(root, 'fast-serve/rspack.extend.mjs'));
    await nextChanges(changes, 4);
    expect(changes[3]).toEqual([{ file: path.join(root, 'fast-serve/rspack.extend.mjs'), exists: false }]);
  });

  it('ignores saves without content changes and other files', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-watch-'));
    writeFileSync(path.join(root, 'package.json'), '{}');
    const changes: FileChange[][] = [];
    watcher = watchFiles([path.join(root, 'package.json')], { onChange: (batch) => changes.push(batch), onError: () => undefined, settleMs: SETTLE_MS });
    writeFileSync(path.join(root, 'package.json'), '{}');
    writeFileSync(path.join(root, 'other.json'), '{}');
    await settle();
    expect(changes).toEqual([]);
    const added = path.join(root, 'tsconfig.json');
    watcher.add([added]);
    writeFileSync(added, '{}');
    await nextChanges(changes, 1);
    expect(changes[0]).toEqual([{ file: added, exists: true }]);
  });
});
