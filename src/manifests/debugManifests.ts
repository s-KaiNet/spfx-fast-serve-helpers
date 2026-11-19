import type { ComponentManifest, SpfxBundle } from '../project/index.js';
import { withDevIconUrls } from './iconUrls.js';

export type ScriptResource =
  | { type: 'path'; path: string; globalName?: string; globalDependencies?: string[] }
  | { type: 'component'; id: string; version: string };

export interface DebugManifest extends ComponentManifest {
  loaderConfig: {
    internalModuleBaseUrls: string[];
    entryModuleId: string;
    exportName?: string;
    scriptResources: Record<string, ScriptResource>;
  };
}

export interface DebugManifestsInput {
  root: string;
  bundles: readonly SpfxBundle[];
  origin: string;
  bundleBaseUrl: string;
  bundleScriptPath(bundleName: string): string;
  scriptResources(bundleName: string): Record<string, ScriptResource>;
}

export function buildDebugManifests(input: DebugManifestsInput): DebugManifest[] {
  return input.bundles.flatMap((bundle) => {
    const scriptResources: Record<string, ScriptResource> = {
      [bundle.name]: { type: 'path', path: input.bundleScriptPath(bundle.name) },
      ...input.scriptResources(bundle.name),
    };
    return bundle.components.map(({ manifest, manifestFile, exportName }) => ({
      ...withDevIconUrls(manifest, { root: input.root, origin: input.origin, manifestFile }),
      loaderConfig: {
        internalModuleBaseUrls: [input.bundleBaseUrl],
        entryModuleId: bundle.name,
        scriptResources,
        ...(exportName === undefined ? {} : { exportName }),
      },
    }));
  });
}

export function renderManifestsModule(manifests: readonly DebugManifest[]): string {
  return [
    'define([], function () {',
    `  var manifests = ${JSON.stringify(manifests, null, 2).replaceAll('\n', '\n  ')};`,
    '  return { getManifests: function () { return manifests; } };',
    '});',
    '',
  ].join('\n');
}
