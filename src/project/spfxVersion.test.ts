import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertSupportedSpfxVersion, findSpfxVersion, type SpfxVersionSource } from './spfxVersion.js';

const fastServe = { name: 'spfx-fast-serve-helpers', version: '1.23.0' };

function projectWith(dependencies: Record<string, string>, installed: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-version-'));
  writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'p', version: '1.0.0', dependencies }));
  for (const [name, version] of Object.entries(installed)) {
    const packageDir = path.join(root, 'node_modules', name);
    mkdirSync(packageDir, { recursive: true });
    writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify({ name, version }));
  }
  return root;
}

function checkMessage(found: SpfxVersionSource): string {
  try {
    assertSupportedSpfxVersion(found, fastServe);
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}

describe('findSpfxVersion', () => {
  it('prefers the installed sp-core-library version', () => {
    const root = projectWith({ '@microsoft/sp-core-library': '~1.23.0' }, { '@microsoft/sp-core-library': '1.23.2' });
    expect(findSpfxVersion(root)).toEqual({ kind: 'installed', version: '1.23.2', packageName: '@microsoft/sp-core-library' });
  });

  it('falls back to spfx-heft-plugins', () => {
    const root = projectWith({}, { '@microsoft/spfx-heft-plugins': '1.23.0' });
    expect(findSpfxVersion(root)).toMatchObject({ kind: 'installed', version: '1.23.0' });
  });

  it('reports declared but not installed and missing SPFx', () => {
    expect(findSpfxVersion(projectWith({ '@microsoft/sp-core-library': '1.23.2' }))).toEqual({
      kind: 'declared',
      range: '1.23.2',
      packageName: '@microsoft/sp-core-library',
    });
    expect(findSpfxVersion(projectWith({ react: '18.3.1' }))).toEqual({ kind: 'missing' });
  });
});

const installed = (version: string): SpfxVersionSource => ({ kind: 'installed', version, packageName: '@microsoft/sp-core-library' });

describe('assertSupportedSpfxVersion', () => {
  it('accepts every 1.23.x version', () => {
    for (const version of ['1.23.0', '1.23.2', '1.23.9', '1.23.3-beta.1']) expect(checkMessage(installed(version))).toBe('');
  });

  it('rejects other versions with what was found and what to install', () => {
    const newer = checkMessage(installed('1.24.0'));
    expect(newer).toContain('this project uses SPFx 1.24.0 (@microsoft/sp-core-library)');
    expect(newer).toContain('supports SPFx >=1.23.0 <1.24.0 only');
    expect(newer).toContain('spfx-fast-serve-helpers@~1.24.0');

    const webpackEra = checkMessage(installed('1.21.1'));
    expect(webpackEra).toContain('https://github.com/s-KaiNet/spfx-fast-serve');
    expect(webpackEra).toContain('spfx-fast-serve-helpers@~1.21.0');

    expect(checkMessage(installed('1.22.0'))).toContain('Upgrade the project to SPFx 1.23');
  });

  it('explains missing installs and non-SPFx folders', () => {
    expect(checkMessage({ kind: 'declared', range: '1.23.2', packageName: '@microsoft/sp-core-library' })).toContain('npm install');
    expect(checkMessage({ kind: 'missing' })).toContain('not an SPFx project');
  });
});
