import { localExternalAssetName } from '../externals/index.js';
import type { ConfigExternal, SpfxLibrary } from '../../../project/index.js';
import type { ScriptResource } from './debugManifests.js';

export const COMPONENT_LOADER_PACKAGE = '@microsoft/sp-loader';

export function bundleScriptResources(
  requests: readonly string[],
  libraries: ReadonlyMap<string, SpfxLibrary>,
  configExternals: ReadonlyMap<string, ConfigExternal> = new Map(),
): Record<string, ScriptResource> {
  const resources: Record<string, ScriptResource> = {};
  const configExternalNames: string[] = [];
  for (const request of [...requests, COMPONENT_LOADER_PACKAGE]) {
    const library = libraries.get(request);
    if (library) resources[request] = { type: 'component', id: library.id, version: library.version };
    else if (configExternals.has(request)) configExternalNames.push(request);
  }
  for (const external of withGlobalDependencies(configExternalNames, configExternals)) resources[external.name] = configExternalResource(external);
  return resources;
}

function withGlobalDependencies(names: readonly string[], configExternals: ReadonlyMap<string, ConfigExternal>): ConfigExternal[] {
  const collected = new Map<string, ConfigExternal>();
  const visit = (name: string): void => {
    const external = configExternals.get(name);
    if (!external || collected.has(name)) return;
    collected.set(name, external);
    for (const dependency of external.globalDependencies ?? []) visit(dependency);
  };
  for (const name of names) visit(name);
  return [...collected.values()];
}

function configExternalResource({ name, source, globalName, globalDependencies }: ConfigExternal): ScriptResource {
  return {
    type: 'path',
    path: source.type === 'url' ? source.url : localExternalAssetName(name, source.file),
    ...(globalName === undefined ? {} : { globalName }),
    ...(globalDependencies === undefined ? {} : { globalDependencies }),
  };
}
