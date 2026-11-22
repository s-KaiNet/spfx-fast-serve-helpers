import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { SpfxBundle } from '../../../project/index.js';
import { buildDebugManifests, renderManifestsModule, type DebugManifest, type ScriptResource } from './debugManifests.js';
import { devIconFiles } from './iconUrls.js';

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
      root: '/p',
      bundles: [bundle],
      origin: 'https://localhost:4321',
      bundleBaseUrl: 'https://localhost:4321/dist/',
      bundleScriptPath: (name) => `${name}.js`,
      scriptResources: (name): Record<string, ScriptResource> => (name === 'hello-web-part' ? { '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' } } : {}),
    });
    expect(manifests).toEqual([
      {
        id: 'abc',
        alias: 'HelloWebPart',
        componentType: 'WebPart',
        version: '1.0.0',
        manifestVersion: 2,
        loaderConfig: {
          internalModuleBaseUrls: ['https://localhost:4321/dist/'],
          entryModuleId: 'hello-web-part',
          scriptResources: {
            'hello-web-part': { type: 'path', path: 'hello-web-part.js' },
            '@microsoft/sp-core-library': { type: 'component', id: 'core', version: '1.24.1' },
          },
        },
      },
    ]);
  });
});

describe('buildDebugManifests with several components in one bundle', () => {
  const sharedBundle: SpfxBundle = {
    name: 'shared-bundle',
    components: [
      {
        bundleName: 'shared-bundle',
        manifestFile: '/p/src/First.manifest.json',
        entryFile: '/p/src/First.ts',
        exportName: 'a',
        manifest: { id: 'first', alias: 'FirstWebPart', componentType: 'WebPart', version: '0.0.1' },
      },
      {
        bundleName: 'shared-bundle',
        manifestFile: '/p/src/Second.manifest.json',
        entryFile: '/p/src/Second.ts',
        exportName: 'b',
        manifest: { id: 'second', alias: 'SecondWebPart', componentType: 'WebPart', version: '0.0.1' },
      },
    ],
  };

  it('points every component at the same bundle script and picks its export', () => {
    const manifests = buildDebugManifests({
      root: '/p',
      bundles: [sharedBundle],
      origin: 'https://localhost:4321',
      bundleBaseUrl: 'https://localhost:4321/dist/',
      bundleScriptPath: (name) => `${name}.js`,
      scriptResources: () => ({}),
    });
    expect(manifests.map(({ id, loaderConfig }) => ({ id, loaderConfig }))).toEqual(
      ['first', 'second'].map((id, index) => ({
        id,
        loaderConfig: {
          internalModuleBaseUrls: ['https://localhost:4321/dist/'],
          entryModuleId: 'shared-bundle',
          scriptResources: { 'shared-bundle': { type: 'path', path: 'shared-bundle.js' } },
          exportName: ['a', 'b'][index],
        },
      })),
    );
  });
});

describe('buildDebugManifests with extensions', () => {
  const extensionsBundle: SpfxBundle = {
    name: 'mixed-bundle',
    components: [
      {
        bundleName: 'mixed-bundle',
        manifestFile: '/p/src/webparts/hello/Hello.manifest.json',
        entryFile: '/p/src/webparts/hello/Hello.ts',
        exportName: 'a',
        manifest: {
          id: 'hello',
          alias: 'HelloWebPart',
          componentType: 'WebPart',
          version: '0.0.1',
          preconfiguredEntries: [{ title: { default: 'Hello' }, iconImageUrl: './assets/hello icon.png' }, { title: { default: 'Font' } }],
        },
      },
      {
        bundleName: 'mixed-bundle',
        manifestFile: '/p/src/extensions/banner/Banner.manifest.json',
        entryFile: '/p/src/extensions/banner/Banner.ts',
        exportName: 'b',
        manifest: { id: 'banner', alias: 'BannerApplicationCustomizer', componentType: 'Extension', extensionType: 'ApplicationCustomizer', version: '0.0.1' },
      },
      {
        bundleName: 'mixed-bundle',
        manifestFile: '/p/src/extensions/commands/Commands.manifest.json',
        entryFile: '/p/src/extensions/commands/Commands.ts',
        exportName: 'c',
        manifest: {
          id: 'commands',
          alias: 'CommandsCommandSet',
          componentType: 'Extension',
          extensionType: 'ListViewCommandSet',
          version: '0.0.1',
          items: {
            COMMAND_1: { title: { default: 'One' }, iconImageUrl: '../commands/icons/one.png', type: 'command' },
            COMMAND_2: { title: { default: 'Two' }, iconImageUrl: 'icons/two.png', type: 'command' },
            COMMAND_3: { title: { default: 'Three' }, iconImageUrl: 'https://cdn/three.png', type: 'command' },
          },
        },
      },
    ],
  };
  const manifests = buildDebugManifests({
    root: '/p',
    bundles: [extensionsBundle],
    origin: 'https://localhost:4321',
    bundleBaseUrl: 'https://localhost:4321/dist/',
    bundleScriptPath: (name) => `${name}.js`,
    scriptResources: () => ({}),
  });

  it('passes extension manifests through with the shared bundle and export names', () => {
    const sharedLoaderConfig = {
      internalModuleBaseUrls: ['https://localhost:4321/dist/'],
      entryModuleId: 'mixed-bundle',
      scriptResources: { 'mixed-bundle': { type: 'path', path: 'mixed-bundle.js' } },
    };
    expect(manifests.map(({ alias, componentType, extensionType, loaderConfig }) => ({ alias, componentType, extensionType, loaderConfig }))).toEqual([
      { alias: 'HelloWebPart', componentType: 'WebPart', extensionType: undefined, loaderConfig: { ...sharedLoaderConfig, exportName: 'a' } },
      {
        alias: 'BannerApplicationCustomizer',
        componentType: 'Extension',
        extensionType: 'ApplicationCustomizer',
        loaderConfig: { ...sharedLoaderConfig, exportName: 'b' },
      },
      { alias: 'CommandsCommandSet', componentType: 'Extension', extensionType: 'ListViewCommandSet', loaderConfig: { ...sharedLoaderConfig, exportName: 'c' } },
    ]);
  });

  it('points relative icon file paths at the dev server, like heft copies them to the CDN', () => {
    expect(manifests[0]?.preconfiguredEntries).toEqual([
      { title: { default: 'Hello' }, iconImageUrl: 'https://localhost:4321/src/webparts/hello/assets/hello%20icon.png' },
      { title: { default: 'Font' } },
    ]);
    expect(manifests[2]?.items).toEqual({
      COMMAND_1: { title: { default: 'One' }, iconImageUrl: 'https://localhost:4321/src/extensions/commands/icons/one.png', type: 'command' },
      COMMAND_2: { title: { default: 'Two' }, iconImageUrl: 'icons/two.png', type: 'command' },
      COMMAND_3: { title: { default: 'Three' }, iconImageUrl: 'https://cdn/three.png', type: 'command' },
    });
    expect(extensionsBundle.components[2]?.manifest.items).toMatchObject({ COMMAND_1: { iconImageUrl: '../commands/icons/one.png' } });
  });
});

describe('buildDebugManifests with an Adaptive Card Extension', () => {
  const aceBundle: SpfxBundle = {
    name: 'hello-adaptive-card-extension',
    components: [
      {
        bundleName: 'hello-adaptive-card-extension',
        manifestFile: '/p/src/adaptiveCardExtensions/hello/HelloAdaptiveCardExtension.manifest.json',
        entryFile: '/p/src/adaptiveCardExtensions/hello/HelloAdaptiveCardExtension.ts',
        manifest: {
          id: 'ace',
          alias: 'HelloAdaptiveCardExtension',
          componentType: 'AdaptiveCardExtension',
          version: '0.0.1',
          supportedHosts: ['Dashboard'],
          preconfiguredEntries: [
            { title: { default: 'Hello' }, iconImageUrl: './assets/MicrosoftLogo.png', cardSize: 'Medium', properties: { title: 'Hello' } },
          ],
        },
      },
    ],
  };

  it('serves it like a web part: card entries kept, relative icons on the dev server', () => {
    const [manifest] = buildDebugManifests({
      root: '/p',
      bundles: [aceBundle],
      origin: 'https://localhost:4321',
      bundleBaseUrl: 'https://localhost:4321/dist/',
      bundleScriptPath: (name) => `${name}.js`,
      scriptResources: () => ({}),
    });
    expect(manifest).toEqual({
      id: 'ace',
      alias: 'HelloAdaptiveCardExtension',
      componentType: 'AdaptiveCardExtension',
      version: '0.0.1',
      supportedHosts: ['Dashboard'],
      preconfiguredEntries: [
        {
          title: { default: 'Hello' },
          iconImageUrl: 'https://localhost:4321/src/adaptiveCardExtensions/hello/assets/MicrosoftLogo.png',
          cardSize: 'Medium',
          properties: { title: 'Hello' },
        },
      ],
      loaderConfig: {
        internalModuleBaseUrls: ['https://localhost:4321/dist/'],
        entryModuleId: 'hello-adaptive-card-extension',
        scriptResources: {
          'hello-adaptive-card-extension': { type: 'path', path: 'hello-adaptive-card-extension.js' },
        },
      },
    });
  });
});

describe('renderManifestsModule', () => {
  it('renders an AMD module whose getManifests() returns the manifests', () => {
    const manifests = buildDebugManifests({
      root: '/p',
      bundles: [bundle],
      origin: 'https://localhost:4321',
      bundleBaseUrl: 'https://localhost:4321/dist/',
      bundleScriptPath: (name) => `${name}.js`,
      scriptResources: () => ({}),
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

describe('devIconFiles', () => {
  it('lists the relative icon files of web part entries and command items by their dev server path', () => {
    const files = devIconFiles('/p', [
      {
        bundleName: 'b',
        manifestFile: '/p/src/webparts/hello/Hello.manifest.json',
        entryFile: '/p/src/webparts/hello/Hello.ts',
        manifest: { id: 'a', alias: 'A', componentType: 'WebPart', version: '1.0.0', preconfiguredEntries: [{ iconImageUrl: './assets/hello icon.png' }, { title: {} }] },
      },
      {
        bundleName: 'b',
        manifestFile: '/p/src/extensions/commands/Commands.manifest.json',
        entryFile: '/p/src/extensions/commands/Commands.ts',
        manifest: {
          id: 'c',
          alias: 'C',
          componentType: 'Extension',
          version: '1.0.0',
          items: { ONE: { iconImageUrl: '../commands/icons/one.png' }, TWO: { iconImageUrl: 'icons/two.png' }, THREE: { iconImageUrl: 'https://cdn/three.png' } },
        },
      },
    ]);
    expect([...files]).toEqual([
      ['/src/webparts/hello/assets/hello icon.png', '/p/src/webparts/hello/assets/hello icon.png'],
      ['/src/extensions/commands/icons/one.png', '/p/src/extensions/commands/icons/one.png'],
    ]);
  });
});
