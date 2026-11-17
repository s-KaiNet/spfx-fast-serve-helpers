import type { ComponentManifest, SpfxBundle } from '../project/index.js';

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
  bundles: readonly SpfxBundle[];

  origin: string;

  bundleScriptPath(bundleName: string): string;

  scriptResources: Record<string, ScriptResource>;
}

export function buildDebugManifests(input: DebugManifestsInput): DebugManifest[] {
  return input.bundles.flatMap((bundle) =>
    bundle.components.map(({ manifest, exportName }) => ({
      ...manifest,
      loaderConfig: {
        internalModuleBaseUrls: [`${input.origin}/`],
        entryModuleId: bundle.name,
        scriptResources: {
          [bundle.name]: { type: 'path', path: input.bundleScriptPath(bundle.name) },
          ...input.scriptResources,
        },
        ...(exportName === undefined ? {} : { exportName }),
      },
    })),
  );
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
