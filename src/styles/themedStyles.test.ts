import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readRuntimeSource } from '../utils/runtimeSource.js';

interface ThemedStylesRuntime {
  detokenize(css: string, theme?: Record<string, string | undefined>): string;
  updateStyle(id: string, css: string): void;
  removeStyle(id: string): void;
}

type ViteStyleCall = [action: 'update' | 'remove', id: string, css?: string];

const VITE_CLIENT_STUB = [
  'export const updateStyle = (id, css) => globalThis.__viteStyleCalls.push(["update", id, css]);',
  'export const removeStyle = (id) => globalThis.__viteStyleCalls.push(["remove", id]);',
].join('\n');

const css = '.title { color: "[theme:themePrimary, default: #0078d4]"; background: "[theme:missingSlot, default: #fff]"; border-color: "[theme:noDefault]"; }';

const folders: string[] = [];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function usePageTheme(theme: Record<string, string>): void {
  vi.stubGlobal('window', { __themeState__: { theme } });
}

async function loadRuntime(): Promise<{ runtime: ThemedStylesRuntime; viteCalls: ViteStyleCall[] }> {
  const folder = mkdtempSync(path.join(tmpdir(), 'fast-serve-themed-styles-'));
  folders.push(folder);
  const source = (await readRuntimeSource('themedStyles')).replace(/(["'])\/@vite\/client\1/, '"./viteClient.mjs"');
  writeFileSync(path.join(folder, 'viteClient.mjs'), VITE_CLIENT_STUB);
  writeFileSync(path.join(folder, 'themedStyles.mjs'), source);
  const viteCalls: ViteStyleCall[] = [];
  vi.stubGlobal('__viteStyleCalls', viteCalls);
  const runtime = (await import(/* @vite-ignore */ pathToFileURL(path.join(folder, 'themedStyles.mjs')).href)) as ThemedStylesRuntime;
  return { runtime, viteCalls };
}

describe('themed styles runtime', () => {
  it('resolves theme tokens from the page theme, falling back to defaults', async () => {
    usePageTheme({ themePrimary: '#a4262c' });
    const { runtime } = await loadRuntime();
    expect(runtime.detokenize(css)).toBe('.title { color: #a4262c; background: #fff; border-color: inherit; }');
    expect(runtime.detokenize(css, {})).toBe('.title { color: #0078d4; background: #fff; border-color: inherit; }');
  });

  it('hands resolved CSS to Vite on every insert and hot update without watching the theme', async () => {
    const setInterval = vi.spyOn(globalThis, 'setInterval');
    const setTimeout = vi.spyOn(globalThis, 'setTimeout');
    usePageTheme({ themePrimary: '#a4262c' });
    const { runtime, viteCalls } = await loadRuntime();
    runtime.updateStyle('/src/Hello.module.scss', css);
    usePageTheme({ themePrimary: '#107c10' });
    runtime.updateStyle('/src/Hello.module.scss', css);
    runtime.removeStyle('/src/Hello.module.scss');
    expect(viteCalls).toEqual([
      ['update', '/src/Hello.module.scss', '.title { color: #a4262c; background: #fff; border-color: inherit; }'],
      ['update', '/src/Hello.module.scss', '.title { color: #107c10; background: #fff; border-color: inherit; }'],
      ['remove', '/src/Hello.module.scss'],
    ]);
    expect(setInterval).not.toHaveBeenCalled();
    expect(setTimeout).not.toHaveBeenCalled();
  });
});
