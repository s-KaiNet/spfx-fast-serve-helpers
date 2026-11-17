import { readFile } from 'node:fs/promises';
import type { Plugin, Rolldown } from 'vite';
import type { ServeContext } from '../context.js';
import type { ScriptResource } from '../manifests/index.js';
import type { ConfigExternal, SpfxLibrary } from '../project/index.js';
import type { LibraryLoaderConfig, SpfxLibraryReference } from '../runtime/contracts.js';
import { readRuntimeScript } from '../utils/runtimeSource.js';
import { isStyleRequest, sendJavaScript } from '../utils/vite.js';
import { readExportNames } from './exportNames.js';
import {
  renderChunkPreload,
  renderCommonJsFacade,
  renderEsmFacade,
  renderExternalCommonJsFacade,
  renderExternalEsmFacade,
} from './facade.js';

export interface SpfxExternals {
  readonly plugin: Plugin;

  manifestScriptResources(): Record<string, ScriptResource>;

  shimPrelude(): Promise<string>;
}

const COMPONENT_LOADER_PACKAGE = '@microsoft/sp-loader';

const CONFIG_EXTERNALS_PATH = '/@spfx/external/';

const FACADE_PREFIXES = {
  library: '\0spfx-library:',
  libraryCommonJs: '\0spfx-library-cjs:',
  external: '\0spfx-external:',
  externalCommonJs: '\0spfx-external-cjs:',
} as const;

type FacadeKind = keyof typeof FACADE_PREFIXES;

interface FacadeId {
  kind: FacadeKind;
  name: string;
}

function configExternalPath(external: ConfigExternal): string {
  return `${CONFIG_EXTERNALS_PATH}${encodeURIComponent(external.name)}.js`;
}

export function createExternals(context: ServeContext): SpfxExternals {
  const { project, logger } = context;
  const exportNamesByPackage = new Map<string, Promise<string[]>>();

  const findLibrary = (name: string): SpfxLibrary | undefined => project.libraries().get(name);
  const findConfigExternal = (name: string): ConfigExternal | undefined =>
    findLibrary(name) ? undefined : project.configExternals().get(name);

  const exportNames = (packageDir: string, onError: (error: unknown) => void): Promise<string[]> => {
    let names = exportNamesByPackage.get(packageDir);
    if (!names) {
      names = readExportNames(packageDir).catch((error: unknown) => {
        onError(error);
        return [];
      });
      exportNamesByPackage.set(packageDir, names);
    }
    return names;
  };

  const libraryExportNames = (library: SpfxLibrary) =>
    exportNames(library.packageDir, (error) => {
      logger.warn(`cannot read the exports of ${library.packageName}, only its default export is available: ${String(error)}`);
    });

  const externalExportNames = (external: ConfigExternal) =>
    external.packageDir === undefined ? Promise.resolve([]) : exportNames(external.packageDir, () => undefined);

  const facadeId = (name: string, commonJs: boolean): string | null => {
    if (findLibrary(name)) return FACADE_PREFIXES[commonJs ? 'libraryCommonJs' : 'library'] + name;
    if (findConfigExternal(name)) return FACADE_PREFIXES[commonJs ? 'externalCommonJs' : 'external'] + name;
    return null;
  };

  const loadFacade = async (id: string): Promise<string | null> => {
    const facade = parseFacadeId(id);
    if (!facade) return null;
    if (facade.kind === 'library' || facade.kind === 'libraryCommonJs') {
      const library = findLibrary(facade.name);
      if (!library) return null;
      return facade.kind === 'libraryCommonJs'
        ? renderCommonJsFacade(toReference(library))
        : renderEsmFacade(toReference(library), await libraryExportNames(library));
    }
    const external = findConfigExternal(facade.name);
    if (!external) return null;
    return facade.kind === 'externalCommonJs'
      ? renderExternalCommonJsFacade(external.name)
      : renderExternalEsmFacade(external.name, await externalExportNames(external));
  };

  const prebundlePlugin: Rolldown.Plugin = {
    name: 'fast-serve:externals-prebundle',
    resolveId: (source, _importer, { kind }) => facadeId(source, kind === 'require-call'),
    load: loadFacade,
    renderChunk(code, chunk) {
      const facades = chunk.moduleIds.flatMap((id) => parseFacadeId(id) ?? []);
      const libraries = uniqueByName(
        facades.flatMap(({ kind, name }) => {
          const library = kind === 'library' || kind === 'libraryCommonJs' ? findLibrary(name) : undefined;
          return library ? [toReference(library)] : [];
        }),
      );
      const externals = [
        ...new Set(facades.flatMap(({ kind, name }) => (kind === 'external' || kind === 'externalCommonJs' ? [name] : []))),
      ];
      const preload = renderChunkPreload({ libraries, externals });
      return preload === '' ? null : { code: preload + code, map: null };
    },
  };

  const configExternalResources = (): Record<string, ScriptResource> =>
    Object.fromEntries(
      [...project.configExternals().values()].map((external) => [
        external.name,
        {
          type: 'path',
          path: external.source.type === 'url' ? external.source.url : context.options.origin + configExternalPath(external),
          ...(external.globalName === undefined ? {} : { globalName: external.globalName }),
          ...(external.globalDependencies === undefined ? {} : { globalDependencies: external.globalDependencies }),
        } satisfies ScriptResource,
      ]),
    );

  return {
    manifestScriptResources() {
      const componentLoader = findLibrary(COMPONENT_LOADER_PACKAGE);
      if (!componentLoader) {
        throw new Error(`${COMPONENT_LOADER_PACKAGE} was not found in node_modules: reinstall the project dependencies.`);
      }
      return {
        [COMPONENT_LOADER_PACKAGE]: { type: 'component', id: componentLoader.id, version: componentLoader.version },
        ...configExternalResources(),
      };
    },

    async shimPrelude() {
      const config: LibraryLoaderConfig = { componentLoaderModule: COMPONENT_LOADER_PACKAGE };
      const runtime = await readRuntimeScript('libraryLoader');
      return ['(function () {', `var __SPFX_LIBRARY_LOADER__ = ${JSON.stringify(config)};`, runtime.trim(), '})();'].join('\n');
    },

    plugin: {
      name: 'fast-serve:externals',
      enforce: 'pre',
      config: () => ({ optimizeDeps: { rolldownOptions: { plugins: [prebundlePlugin] } } }),
      configureServer(server) {
        server.middlewares.use(CONFIG_EXTERNALS_PATH, (req, res, next) => {
          const external = findLocalExternal(req.url ?? '');
          if (!external || (req.method !== 'GET' && req.method !== 'HEAD')) {
            next();
            return;
          }
          readFile(external.file, 'utf8').then((code) => {
            sendJavaScript(res, code);
          }, next);
        });
      },
      resolveId(source, importer) {
        if (isStyleRequest(importer)) return null;
        return facadeId(source, false);
      },
      load: loadFacade,
    },
  };

  function findLocalExternal(requestPath: string): { file: string } | undefined {
    const fileName = decodeURIComponent(requestPath.replace(/^\//, '').split('?')[0] ?? '');
    const external = findConfigExternal(fileName.replace(/\.js$/, ''));
    return external?.source.type === 'file' ? external.source : undefined;
  }
}

function parseFacadeId(id: string): FacadeId | undefined {
  for (const [kind, prefix] of Object.entries(FACADE_PREFIXES) as [FacadeKind, string][]) {
    if (id.startsWith(prefix)) return { kind, name: id.slice(prefix.length) };
  }
  return undefined;
}

function toReference(library: SpfxLibrary): SpfxLibraryReference {
  return { name: library.packageName, id: library.id, version: library.version };
}

function uniqueByName(libraries: readonly SpfxLibraryReference[]): SpfxLibraryReference[] {
  return [...new Map(libraries.map((library) => [library.name, library])).values()];
}
