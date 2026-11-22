import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { CACHE_FOLDER, configText, filesText, withPersistentCache } from './index.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tempRoot(): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-cache-'));
  roots.push(root);
  return root;
}

class FakePlugin {
  constructor(readonly options: Record<string, unknown>) {}
}

describe('configText', () => {
  it('is stable across key order and includes functions, regular expressions and class names', () => {
    const first = configText({ b: 1, a: [/x/i, () => 'y'], plugin: new FakePlugin({ value: 1 }) });
    const second = configText({ plugin: new FakePlugin({ value: 1 }), a: [/x/i, () => 'y'], b: 1 });
    expect(first).toBe(second);
    expect(first).toContain('re:/x/i');
    expect(first).toContain('FakePlugin{');
    expect(configText({ plugin: new FakePlugin({ value: 2 }) })).not.toBe(configText({ plugin: new FakePlugin({ value: 1 }) }));
  });

  it('does not run getters and survives cycles and maps', () => {
    let reads = 0;
    const options = {
      get implementation() {
        reads += 1;
        return {};
      },
    };
    const cyclic: Record<string, unknown> = { map: new Map([['k', 1]]) };
    cyclic.self = cyclic;
    expect(configText({ options, cyclic })).toContain('[circular]');
    expect(reads).toBe(0);
  });
});

describe('withPersistentCache', () => {
  it('stores the cache under temp/fast-serve/cache and ignores the per-start hash salt', () => {
    const root = tempRoot();
    const first = withPersistentCache({ root, config: { output: { hashSalt: '1', publicPath: 'https://localhost:4321/dist/' } }, files: [] });
    const second = withPersistentCache({ root, config: { output: { hashSalt: '2', publicPath: 'https://localhost:4321/dist/' } }, files: [] });
    expect(first.cache).toMatchObject({ type: 'persistent', storage: { type: 'filesystem', directory: path.join(root, CACHE_FOLDER) } });
    expect(versionOf(first)).toBe(versionOf(second));
  });

  it('changes the version when the config, a project file or the lock file changes', () => {
    const root = tempRoot();
    const tsconfig = path.join(root, 'tsconfig.json');
    writeFileSync(tsconfig, '{}');
    const config = { output: { publicPath: 'https://localhost:4321/dist/' } };
    const base = versionOf(withPersistentCache({ root, config, files: [tsconfig] }));
    expect(versionOf(withPersistentCache({ root, config: { output: { publicPath: 'https://localhost:4322/dist/' } }, files: [tsconfig] }))).not.toBe(base);
    writeFileSync(tsconfig, '{ "compilerOptions": {} }');
    const edited = versionOf(withPersistentCache({ root, config, files: [tsconfig] }));
    expect(edited).not.toBe(base);
    writeFileSync(path.join(root, 'package-lock.json'), '{}');
    expect(versionOf(withPersistentCache({ root, config, files: [tsconfig] }))).not.toBe(edited);
  });
});

describe('filesText', () => {
  it('marks missing files', () => {
    expect(filesText([path.join(tempRoot(), 'nope.json')])).toContain('missing');
  });
});

function versionOf(config: { cache?: unknown }): string {
  return (config.cache as { version: string }).version;
}
