import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readExportNames } from './exportNames.js';
import { renderFacadeModule } from './facade.js';
import { findUsedLibraries } from './usedLibraries.js';

const root = fileURLToPath(new URL('../../test/fixtures/basic', import.meta.url));

describe('readExportNames', () => {
  it('follows export * in the ESM entry', async () => {
    expect(await readExportNames(root, '@microsoft/sp-core-library')).toEqual(['Guid', 'Log', 'Version']);
  });

  it('falls back to requiring CommonJS packages', async () => {
    expect(await readExportNames(root, 'plain-lib')).toEqual(['escape']);
  });
});

describe('findUsedLibraries', () => {
  it('lists the libraries src imports', () => {
    const libraries = new Set(['@microsoft/sp-core-library', '@microsoft/sp-http']);
    expect(findUsedLibraries(path.join(root, 'src'), libraries)).toEqual(['@microsoft/sp-core-library']);
  });
});

describe('renderFacadeModule', () => {
  it('re-exports the preloaded instance', () => {
    const code = renderFacadeModule('@microsoft/sp-core-library', ['Version']);
    expect(code).toContain('window.__spfxFastServe.externals');
    expect(code).toContain('["@microsoft/sp-core-library"]');
    expect(code).toContain('export { __e0 as Version };');
  });
});
