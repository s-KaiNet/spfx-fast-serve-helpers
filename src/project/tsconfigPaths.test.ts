import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { aliasCandidates, hasPathResolution, matchesPathAlias, readTsconfigPaths } from './tsconfigPaths.js';

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

function candidatesFor(root: string, specifier: string): string[] {
  return aliasCandidates(readTsconfigPaths(path.join(root, 'tsconfig.json')), specifier).map((file) => path.relative(root, file));
}

describe('tsconfig paths', () => {
  it('maps wildcard patterns relative to baseUrl and tries every target in order', () => {
    const root = project({
      'tsconfig.json': '{\n  // SPFx projects keep comments\n  "compilerOptions": { "baseUrl": "./src", "paths": { "@components/*": ["components/*"], "@multi/*": ["missing/*", "second/*"], }, },\n}',
    });
    expect(candidatesFor(root, '@components/Button')).toEqual(['src/components/Button', 'src/@components/Button']);
    expect(candidatesFor(root, '@multi/deep/Thing')).toEqual(['src/missing/deep/Thing', 'src/second/deep/Thing', 'src/@multi/deep/Thing']);
  });

  it('prefers exact keys, then the longest matching prefix, and keeps suffixes', () => {
    const root = project({
      'tsconfig.json': {
        compilerOptions: {
          paths: {
            '*': ['fallback/*'],
            '@c/*': ['components/*'],
            '@c/special/*': ['special/*'],
            '@c/exact': ['exact.ts'],
            'icons/*.svg': ['assets/icons/*.svg'],
          },
        },
      },
    });
    expect(candidatesFor(root, '@c/exact')).toEqual(['exact.ts']);
    expect(candidatesFor(root, '@c/special/X')).toEqual(['special/X']);
    expect(candidatesFor(root, '@c/Card')).toEqual(['components/Card']);
    expect(candidatesFor(root, 'icons/home.svg')).toEqual(['assets/icons/home.svg']);
    expect(candidatesFor(root, 'react')).toEqual(['fallback/react']);
  });

  it('treats explicit paths keys as aliases, but not the catch-all "*" or baseUrl-only resolution', () => {
    const root = project({
      'tsconfig.json': { compilerOptions: { baseUrl: '.', paths: { '*': ['fallback/*'], '@assets/*': ['src/assets/*'], 'icons/*.svg': ['src/icons/*.svg'], '@logo': ['src/logo.png'] } } },
    });
    const paths = readTsconfigPaths(path.join(root, 'tsconfig.json'));
    expect(['@assets/logo.png', 'icons/home.svg', '@logo'].filter((specifier) => matchesPathAlias(paths, specifier))).toEqual(['@assets/logo.png', 'icons/home.svg', '@logo']);
    expect(['react', 'src/assets/logo.png', './logo.png', 'icons/home.png'].filter((specifier) => matchesPathAlias(paths, specifier))).toEqual([]);
  });

  it('resolves bare specifiers against baseUrl when there are no paths', () => {
    const root = project({ 'tsconfig.json': { compilerOptions: { baseUrl: 'src' } } });
    const paths = readTsconfigPaths(path.join(root, 'tsconfig.json'));
    expect(hasPathResolution(paths)).toBe(true);
    expect(candidatesFor(root, 'webparts/hello/Hello')).toEqual(['src/webparts/hello/Hello']);
  });

  it('ignores relative, absolute, virtual and protocol specifiers', () => {
    const root = project({ 'tsconfig.json': { compilerOptions: { baseUrl: '.', paths: { '*': ['src/*'] } } } });
    for (const specifier of ['./Hello', '../Hello', '.', '/src/Hello', path.join(root, 'src'), '\0virtual', 'virtual:fast-serve/x', 'node:fs']) {
      expect(candidatesFor(root, specifier)).toEqual([]);
    }
  });

  it('reads paths and baseUrl through extends chains relative to the config that declares them', () => {
    const root = project({
      'configs/paths.json': { compilerOptions: { paths: { '@lib/*': ['../src/lib/*'] } } },
      'tsconfig.base.json': { extends: './configs/paths.json' },
      'tsconfig.json': { extends: './tsconfig.base' },
    });
    expect(candidatesFor(root, '@lib/util')).toEqual(['src/lib/util']);
    expect(readTsconfigPaths(path.join(root, 'tsconfig.json')).files).toEqual(
      ['tsconfig.json', 'tsconfig.base.json', 'configs/paths.json'].map((file) => path.join(root, file)),
    );
  });

  it('resolves inherited paths against an inherited baseUrl and lets own paths replace inherited ones', () => {
    const root = project({
      'node_modules/rig/profiles/default/tsconfig-base.json': { compilerOptions: { baseUrl: '../../../..', paths: { '@base/*': ['base/*'] } } },
      'node_modules/rig/package.json': { name: 'rig' },
      'tsconfig.json': { extends: 'rig/profiles/default/tsconfig-base.json', compilerOptions: { paths: { '@own/*': ['src/own/*'] } } },
    });
    expect(candidatesFor(root, '@own/a')).toEqual(['src/own/a', '@own/a']);
    expect(candidatesFor(root, '@base/a')).toEqual(['@base/a']);
  });

  it('merges an extends array in order', () => {
    const root = project({
      'a.json': { compilerOptions: { baseUrl: 'from-a', paths: { '@x/*': ['a/*'] } } },
      'b.json': { compilerOptions: { paths: { '@x/*': ['b/*'] } } },
      'tsconfig.json': { extends: ['./a.json', './b.json'] },
    });
    expect(candidatesFor(root, '@x/y')).toEqual(['from-a/b/y', 'from-a/@x/y']);
  });

  it('skips invalid patterns and targets', () => {
    const root = project({ 'tsconfig.json': { compilerOptions: { paths: { '@a/*/*': ['a/*'], '@b/*': [], '@c/*': 'c/*', '@d/*': [1, 'd/*'] } } } });
    expect(candidatesFor(root, '@a/x/y')).toEqual([]);
    expect(candidatesFor(root, '@b/x')).toEqual([]);
    expect(candidatesFor(root, '@c/x')).toEqual([]);
    expect(candidatesFor(root, '@d/x')).toEqual(['d/x']);
  });

  it('reports missing and circular extends', () => {
    const missing = project({ 'tsconfig.json': { extends: './nope.json' } });
    expect(() => readTsconfigPaths(path.join(missing, 'tsconfig.json'))).toThrow(/extends "\.\/nope\.json", which does not exist/);
    const circular = project({ 'a.json': { extends: './tsconfig.json' }, 'tsconfig.json': { extends: './a.json' } });
    expect(() => readTsconfigPaths(path.join(circular, 'tsconfig.json'))).toThrow(/Circular "extends"/);
  });
});
