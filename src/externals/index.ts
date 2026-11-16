import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../context.js';
import type { ScriptResource } from '../manifests/index.js';
import type { SpfxLibrary } from '../project/index.js';
import type { LibraryLoaderConfig, SpfxLibraryReference } from '../runtime/contracts.js';
import { readRuntimeSource } from '../utils/runtimeSource.js';
import { isStyleRequest } from '../utils/vite.js';
import { readExportNames } from './exportNames.js';
import { renderChunkPreload, renderCommonJsFacade, renderEsmFacade } from './facade.js';

export interface SpfxExternals {
  readonly plugin: Plugin;

  manifestScriptResources(): Record<string, ScriptResource>;

  shimPrelude(): Promise<string>;
}

const COMPONENT_LOADER_PACKAGE = '@microsoft/sp-loader';

const ESM_FACADE_PREFIX = '\0spfx-library:';
const COMMONJS_FACADE_PREFIX = '\0spfx-library-cjs:';

export function createExternals(context: ServeContext): SpfxExternals {
  const { project, logger } = context;
  const exportNamesByPackage = new Map<string, Promise<string[]>>();

  const findLibrary = (packageName: string): SpfxLibrary | undefined => project.libraries().get(packageName);

  const exportNames = (library: SpfxLibrary): Promise<string[]> => {
    let names = exportNamesByPackage.get(library.packageName);
    if (!names) {
      names = readExportNames(library.packageDir).catch((error: unknown) => {
        logger.warn(`cannot read the exports of ${library.packageName}, only its default export is available: ${String(error)}`);
        return [];
      });
      exportNamesByPackage.set(library.packageName, names);
    }
    return names;
  };

  const loadFacade = async (id: string): Promise<string | null> => {
    const facade = parseFacadeId(id);
    const library = facade && findLibrary(facade.packageName);
    if (!facade || !library) return null;
    const reference = toReference(library);
    return facade.kind === 'commonjs' ? renderCommonJsFacade(reference) : renderEsmFacade(reference, await exportNames(library));
  };

  const prebundlePlugin: Rolldown.Plugin = {
    name: 'fast-serve:externals-prebundle',
    resolveId(source, _importer, { kind }) {
      if (!findLibrary(source)) return null;
      return (kind === 'require-call' ? COMMONJS_FACADE_PREFIX : ESM_FACADE_PREFIX) + source;
    },
    load: loadFacade,
    renderChunk(code, chunk) {
      const libraries = chunk.moduleIds.flatMap((id) => {
        const library = findLibrary(parseFacadeId(id)?.packageName ?? '');
        return library ? [toReference(library)] : [];
      });
      return libraries.length === 0 ? null : { code: renderChunkPreload(uniqueByName(libraries)) + code, map: null };
    },
  };

  return {
    manifestScriptResources() {
      const componentLoader = findLibrary(COMPONENT_LOADER_PACKAGE);
      if (!componentLoader) {
        throw new Error(`${COMPONENT_LOADER_PACKAGE} was not found in node_modules: reinstall the project dependencies.`);
      }
      return {
        [COMPONENT_LOADER_PACKAGE]: { type: 'component', id: componentLoader.id, version: componentLoader.version },
      };
    },

    async shimPrelude() {
      const config: LibraryLoaderConfig = { componentLoaderModule: COMPONENT_LOADER_PACKAGE };
      const runtime = await readRuntimeSource('libraryLoader');
      return ['(function () {', `var __SPFX_LIBRARY_LOADER__ = ${JSON.stringify(config)};`, runtime.trim(), '})();'].join('\n');
    },

    plugin: {
      name: 'fast-serve:externals',
      enforce: 'pre',
      config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
      resolveId(source, importer) {
        if (isStyleRequest(importer) || !findLibrary(source)) return null;
        return ESM_FACADE_PREFIX + source;
      },
      load: loadFacade,
    },
  };
}

function parseFacadeId(id: string): { kind: 'esm' | 'commonjs'; packageName: string } | undefined {
  if (id.startsWith(ESM_FACADE_PREFIX)) return { kind: 'esm', packageName: id.slice(ESM_FACADE_PREFIX.length) };
  if (id.startsWith(COMMONJS_FACADE_PREFIX)) return { kind: 'commonjs', packageName: id.slice(COMMONJS_FACADE_PREFIX.length) };
  return undefined;
}

function toReference(library: SpfxLibrary): SpfxLibraryReference {
  return { name: library.packageName, id: library.id, version: library.version };
}

function uniqueByName(libraries: readonly SpfxLibraryReference[]): SpfxLibraryReference[] {
  return [...new Map(libraries.map((library) => [library.name, library])).values()];
}
