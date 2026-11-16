import path from 'node:path';
import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import type { ScriptResource } from '../manifests/index.js';
import type { ShimExternalsConfig } from '../runtime/contracts.js';
import { isStyleRequest } from '../utils/vite.js';
import { readExportNames } from './exportNames.js';
import { renderFacadeModule } from './facade.js';
import { findUsedLibraries } from './usedLibraries.js';

export interface SpfxExternals {
  readonly plugin: Plugin;

  manifestScriptResources(): Record<string, ScriptResource>;

  shimConfig(): ShimExternalsConfig;
}

const VIRTUAL_PREFIX = '\0spfx-external:';

export function createExternals(context: ServeContext): SpfxExternals {
  const { project, root } = context;
  const exportNames = new Map<string, Promise<string[]>>();
  let usedLibraries: string[] | undefined;

  const scanUsedLibraries = (): string[] =>
    (usedLibraries = findUsedLibraries(path.join(root, 'src'), new Set(project.libraries().keys())));

  return {
    manifestScriptResources() {
      const libraries = project.libraries();
      return Object.fromEntries(
        scanUsedLibraries().flatMap((name): [string, ScriptResource][] => {
          const library = libraries.get(name);
          return library ? [[name, { type: 'component', id: library.id, version: library.version }]] : [];
        }),
      );
    },

    shimConfig: () => ({ preload: usedLibraries ?? scanUsedLibraries() }),

    plugin: {
      name: 'fast-serve:externals',
      enforce: 'pre',
      resolveId(source, importer) {
        if (isStyleRequest(importer) || !project.libraries().has(source)) return null;
        return VIRTUAL_PREFIX + source;
      },
      async load(id) {
        if (!id.startsWith(VIRTUAL_PREFIX)) return null;
        const packageName = id.slice(VIRTUAL_PREFIX.length);
        let names = exportNames.get(packageName);
        if (!names) {
          names = readExportNames(root, packageName);
          exportNames.set(packageName, names);
        }
        return renderFacadeModule(packageName, await names);
      },
    },
  };
}
