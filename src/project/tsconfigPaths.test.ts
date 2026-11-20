import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadTsconfig } from './tsconfig.js';
import { hasPathResolution, tsconfigPathsOf, type TsconfigPaths } from './tsconfigPaths.js';

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files: Record<string, unknown>): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-tsconfig-'));
  roots.push(root);
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), typeof content === 'string' ? content : JSON.stringify(content));
  }
  return root;
}

function pathsOf(root: string): TsconfigPaths {
  return tsconfigPathsOf(loadTsconfig(path.join(root, 'tsconfig.json')));
}

describe('tsconfig paths', () => {
  it('reads wildcard and exact patterns and baseUrl from a commented tsconfig', () => {
    const root = project({
      'tsconfig.json': '{\n  // SPFx projects keep comments\n  "compilerOptions": { "baseUrl": "./src", "paths": { "@components/*": ["components/*"], "@logo": ["logo.png"], }, },\n}',
    });
    const paths = pathsOf(root);
    expect(paths.baseUrl).toBe(path.join(root, 'src'));
    expect(paths.mappings).toEqual([
      { prefix: '@components/', suffix: '', wildcard: true, targets: ['components/*'] },
      { prefix: '@logo', suffix: '', wildcard: false, targets: ['logo.png'] },
    ]);
    expect(hasPathResolution(paths)).toBe(true);
  });

  it('counts baseUrl alone as path resolution, and neither as none', () => {
    expect(hasPathResolution(pathsOf(project({ 'tsconfig.json': { compilerOptions: { baseUrl: 'src' } } })))).toBe(true);
    expect(hasPathResolution(pathsOf(project({ 'tsconfig.json': { compilerOptions: { strict: true } } })))).toBe(false);
  });

  it('reads paths and baseUrl through extends chains and lists every file of the chain', () => {
    const root = project({
      'configs/paths.json': { compilerOptions: { paths: { '@lib/*': ['../src/lib/*'] } } },
      'tsconfig.base.json': { extends: './configs/paths.json' },
      'tsconfig.json': { extends: './tsconfig.base' },
    });
    const paths = pathsOf(root);
    expect(paths.mappings).toEqual([{ prefix: '@lib/', suffix: '', wildcard: true, targets: ['../src/lib/*'] }]);
    expect(paths.files).toEqual(['tsconfig.json', 'tsconfig.base.json', 'configs/paths.json'].map((file) => path.join(root, file)));
  });

  it('resolves an inherited baseUrl against the config that declares it and lets own paths replace inherited ones', () => {
    const root = project({
      'node_modules/rig/profiles/default/tsconfig-base.json': { compilerOptions: { baseUrl: '../../../..', paths: { '@base/*': ['base/*'] } } },
      'node_modules/rig/package.json': { name: 'rig' },
      'tsconfig.json': { extends: 'rig/profiles/default/tsconfig-base.json', compilerOptions: { paths: { '@own/*': ['src/own/*'] } } },
    });
    const paths = pathsOf(root);
    expect(paths.baseUrl).toBe(root);
    expect(paths.mappings).toEqual([{ prefix: '@own/', suffix: '', wildcard: true, targets: ['src/own/*'] }]);
  });

  it('merges an extends array in order', () => {
    const root = project({
      'a.json': { compilerOptions: { baseUrl: 'from-a', paths: { '@x/*': ['a/*'] } } },
      'b.json': { compilerOptions: { paths: { '@x/*': ['b/*'] } } },
      'tsconfig.json': { extends: ['./a.json', './b.json'] },
    });
    const paths = pathsOf(root);
    expect(paths.baseUrl).toBe(path.join(root, 'from-a'));
    expect(paths.mappings).toEqual([{ prefix: '@x/', suffix: '', wildcard: true, targets: ['b/*'] }]);
  });

  it('skips invalid patterns and targets', () => {
    const root = project({ 'tsconfig.json': { compilerOptions: { paths: { '@a/*/*': ['a/*'], '@b/*': [], '@c/*': 'c/*', '@d/*': [1, 'd/*'] } } } });
    expect(pathsOf(root).mappings).toEqual([{ prefix: '@d/', suffix: '', wildcard: true, targets: ['d/*'] }]);
  });

  it('reports missing and circular extends', () => {
    const missing = project({ 'tsconfig.json': { extends: './nope.json' } });
    expect(() => pathsOf(missing)).toThrow(/extends "\.\/nope\.json", which does not exist/);
    const circular = project({ 'a.json': { extends: './tsconfig.json' }, 'tsconfig.json': { extends: './a.json' } });
    expect(() => pathsOf(circular)).toThrow(/Circular "extends"/);
  });
});
