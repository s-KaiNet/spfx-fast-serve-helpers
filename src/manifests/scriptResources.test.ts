import { describe, expect, it } from 'vitest';
import type { ConfigExternal, SpfxLibrary } from '../project/index.js';
import { bundleScriptResources } from './scriptResources.js';

function library(packageName: string, id: string): [string, SpfxLibrary] {
  return [packageName, { packageName, id, version: '1.24.1', packageDir: `/p/node_modules/${packageName}` }];
}

const libraries = new Map([
  library('@microsoft/sp-core-library', 'core'),
  library('@microsoft/sp-webpart-base', 'webpart'),
  library('@microsoft/sp-loader', 'loader'),
  library('@microsoft/sp-property-pane', 'pane'),
]);

const configExternals = new Map<string, ConfigExternal>([
  ['jquery', { name: 'jquery', source: { type: 'url', url: 'https://cdn.example.com/jquery.js' }, globalName: 'jQuery' }],
  ['chart-plugin', { name: 'chart-plugin', source: { type: 'file', file: '/p/externals/plugin.min.js' }, globalName: 'ChartPlugin', globalDependencies: ['jquery'] }],
  ['unused', { name: 'unused', source: { type: 'url', url: 'https://cdn.example.com/unused.js' } }],
]);

describe('bundleScriptResources', () => {
  it('lists the SPFx libraries a bundle uses, plus the component loader', () => {
    expect(bundleScriptResources(['@microsoft/sp-core-library', '@microsoft/sp-webpart-base'], libraries)).toEqual({
      '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' },
      '@microsoft/sp-webpart-base': { type: 'component', id: 'webpart', version: '1.24.1' },
      '@microsoft/sp-loader': { type: 'component', id: 'loader', version: '1.24.1' },
    });
  });

  it('leaves out libraries the bundle does not use and requests that are not SPFx libraries', () => {
    expect(Object.keys(bundleScriptResources(['unknown-package'], libraries))).toEqual(['@microsoft/sp-loader']);
    expect(bundleScriptResources([], new Map())).toEqual({});
  });

  it('lists the used config.json externals with their global dependencies as path resources', () => {
    expect(bundleScriptResources(['chart-plugin'], libraries, configExternals)).toEqual({
      '@microsoft/sp-loader': { type: 'component', id: 'loader', version: '1.24.1' },
      'chart-plugin': { type: 'path', path: 'chart-plugin.js', globalName: 'ChartPlugin', globalDependencies: ['jquery'] },
      jquery: { type: 'path', path: 'https://cdn.example.com/jquery.js', globalName: 'jQuery' },
    });
  });
});
