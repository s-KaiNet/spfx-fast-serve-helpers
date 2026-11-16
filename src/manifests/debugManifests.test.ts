import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { SpfxBundle } from '../project/index.js';
import { buildDebugManifests, renderManifestsModule, type DebugManifest } from './debugManifests.js';

const bundle: SpfxBundle = {
  name: 'hello-web-part',
  components: [
    {
      bundleName: 'hello-web-part',
      manifestFile: '/p/src/Hello.manifest.json',
      entryFile: '/p/src/Hello.ts',
      manifest: { id: 'abc', alias: 'HelloWebPart', componentType: 'WebPart', version: '1.0.0', manifestVersion: 2 },
    },
  ],
};

describe('buildDebugManifests', () => {
  it('points the loader at the dev server', () => {
    const manifests = buildDebugManifests({
      bundles: [bundle],
      origin: 'https://localhost:4321',
      bundleScriptPath: (name) => `@spfx/bundle/${name}.js`,
      scriptResources: { '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' } },
    });
    expect(manifests).toEqual([
      {
        id: 'abc',
        alias: 'HelloWebPart',
        componentType: 'WebPart',
        version: '1.0.0',
        manifestVersion: 2,
        loaderConfig: {
          internalModuleBaseUrls: ['https://localhost:4321/'],
          entryModuleId: 'hello-web-part',
          scriptResources: {
            'hello-web-part': { type: 'path', path: '@spfx/bundle/hello-web-part.js' },
            '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' },
          },
        },
      },
    ]);
  });
});

describe('renderManifestsModule', () => {
  it('renders an AMD module whose getManifests() returns the manifests', () => {
    const manifests = buildDebugManifests({
      bundles: [bundle],
      origin: 'https://localhost:4321',
      bundleScriptPath: (name) => `${name}.js`,
      scriptResources: {},
    });
    let exported: { getManifests(): DebugManifest[] } | undefined;
    const define = (deps: string[], factory: () => typeof exported) => {
      expect(deps).toEqual([]);
      exported = factory();
    };
    runInNewContext(renderManifestsModule(manifests), { define });
    expect(exported?.getManifests()).toEqual(manifests);
  });
});
