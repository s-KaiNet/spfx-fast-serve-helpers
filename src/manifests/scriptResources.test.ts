import { describe, expect, it } from 'vitest';
import type { SpfxLibrary } from '../project/index.js';
import { libraryScriptResources } from './scriptResources.js';

function library(packageName: string, id: string): [string, SpfxLibrary] {
  return [packageName, { packageName, id, version: '1.24.1', packageDir: `/p/node_modules/${packageName}` }];
}

const libraries = new Map([
  library('@microsoft/sp-core-library', 'core'),
  library('@microsoft/sp-webpart-base', 'webpart'),
  library('@microsoft/sp-loader', 'loader'),
  library('@microsoft/sp-property-pane', 'pane'),
]);

describe('libraryScriptResources', () => {
  it('lists the SPFx libraries a bundle uses, plus the component loader', () => {
    expect(libraryScriptResources(['@microsoft/sp-core-library', '@microsoft/sp-webpart-base'], libraries)).toEqual({
      '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' },
      '@microsoft/sp-webpart-base': { type: 'component', id: 'webpart', version: '1.24.1' },
      '@microsoft/sp-loader': { type: 'component', id: 'loader', version: '1.24.1' },
    });
  });

  it('leaves out libraries the bundle does not use and requests that are not SPFx libraries', () => {
    expect(Object.keys(libraryScriptResources(['unknown-package'], libraries))).toEqual(['@microsoft/sp-loader']);
    expect(libraryScriptResources([], new Map())).toEqual({});
  });
});
