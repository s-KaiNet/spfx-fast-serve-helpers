import type { SpfxLibrary } from '../project/index.js';
import type { ScriptResource } from './debugManifests.js';

export const COMPONENT_LOADER_PACKAGE = '@microsoft/sp-loader';

export function libraryScriptResources(requests: readonly string[], libraries: ReadonlyMap<string, SpfxLibrary>): Record<string, ScriptResource> {
  const resources: Record<string, ScriptResource> = {};
  for (const request of [...requests, COMPONENT_LOADER_PACKAGE]) {
    const library = libraries.get(request);
    if (library) resources[request] = { type: 'component', id: library.id, version: library.version };
  }
  return resources;
}
