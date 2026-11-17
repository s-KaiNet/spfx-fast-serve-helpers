type LibraryLoaderConfig = import('./contracts.js').LibraryLoaderConfig;
type LibraryLoaderGlobal = import('./contracts.js').FastServeGlobal;
type LibraryReference = import('./contracts.js').SpfxLibraryReference;
type LibraryScopedRequire = import('./contracts.js').ScopedRequire;

interface SpComponentLoaderModule {
  SPComponentLoader: { loadComponentById(id: string, version?: string): Promise<unknown> };
}

declare const __SPFX_LIBRARY_LOADER__: LibraryLoaderConfig;

function describeLoadError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

interface RequireJsContexts {
  s?: { contexts?: Record<string, { defined?: Record<string, unknown> } | undefined> };
}

const STORE_VERSIONS = /Store had \[([^\]]*)\]/;
const VERSION_PARTS = /^(\d+)\.(\d+)\.(\d+)/;

function compareVersions(left: string, right: string): number {
  const leftParts = VERSION_PARTS.exec(left);
  const rightParts = VERSION_PARTS.exec(right);
  if (!leftParts || !rightParts) return 0;
  for (let index = 1; index <= 3; index++) {
    const difference = Number(leftParts[index]) - Number(rightParts[index]);
    if (difference !== 0) return difference;
  }
  return 0;
}

function versionsServedByPage(library: LibraryReference, loadError: string): string[] {
  const versions = new Set<string>();
  const storeVersions = STORE_VERSIONS.exec(loadError)?.[1];
  for (const version of storeVersions?.split(',') ?? []) {
    if (version.trim() !== '') versions.add(version.trim());
  }
  const requireJs = (window as unknown as { requirejs?: RequireJsContexts }).requirejs;
  const prefix = `${library.id}_`;
  for (const moduleId of Object.keys(requireJs?.s?.contexts?._?.defined ?? {})) {
    if (moduleId.startsWith(prefix)) versions.add(moduleId.slice(prefix.length));
  }
  return [...versions].filter((version) => VERSION_PARTS.test(version));
}

function olderPageVersionHint(library: LibraryReference, loadError: string): string {
  const served = versionsServedByPage(library, loadError);
  if (served.length === 0 || !served.every((version) => compareVersions(version, library.version) < 0)) return '';
  return (
    `this SharePoint serves ${library.name} ${served.join(', ')}, older than ${library.version} used by the project. ` +
    'The project uses a newer SPFx version than this tenant supports (it would fail in production too): ' +
    'use the SPFx version the tenant supports, or wait for the tenant update.'
  );
}

function describeLibrary(library: LibraryReference): string {
  return `"${library.name}" (component ${library.id}, version ${library.version})`;
}

function createLibraryLoader(config: LibraryLoaderConfig): LibraryLoaderGlobal {
  const pending = new Map<string, Promise<unknown>>();
  const loaded = new Map<string, unknown>();
  let scopedRequire: LibraryScopedRequire | undefined;
  let componentLoader: Promise<SpComponentLoaderModule['SPComponentLoader']> | undefined;

  const requireScoped = (moduleName: string) =>
    new Promise<unknown>((resolve, reject) => {
      if (!scopedRequire) {
        reject(new Error('the bundle shim has not received the RequireJS require yet'));
        return;
      }
      scopedRequire([moduleName], resolve, reject);
    });

  const getComponentLoader = () =>
    (componentLoader ??= requireScoped(config.componentLoaderModule).then(
      (loaderModule) => (loaderModule as SpComponentLoaderModule).SPComponentLoader,
    ));

  const pendingExternals = new Map<string, Promise<unknown>>();
  const loadedExternals = new Map<string, unknown>();

  const loadExternal = (name: string): Promise<unknown> => {
    let request = pendingExternals.get(name);
    if (!request) {
      request = requireScoped(name).then(
        (externalModule) => {
          loadedExternals.set(name, externalModule);
          return externalModule;
        },
        (error: unknown) => {
          const failure = new Error(
            `[fast-serve] Cannot load "${name}" from config/config.json "externals": ${describeLoadError(error)}`,
            { cause: error },
          );
          console.error(failure);
          throw failure;
        },
      );
      pendingExternals.set(name, request);
    }
    return request;
  };

  const loadLibrary = (library: LibraryReference): Promise<unknown> => {
    let request = pending.get(library.name);
    if (!request) {
      request = getComponentLoader()
        .then((loader) => loader.loadComponentById(library.id, library.version))
        .then(
          (libraryModule) => {
            loaded.set(library.name, libraryModule);
            return libraryModule;
          },
          (error: unknown) => {
            const loadError = describeLoadError(error);
            const versionHint = olderPageVersionHint(library, loadError);
            const reason = versionHint === '' ? loadError : `${versionHint} SharePoint error: ${loadError}`;
            const failure = new Error(`[fast-serve] Cannot load SPFx library ${describeLibrary(library)} from SharePoint: ${reason}`, {
              cause: error,
            });
            console.error(failure);
            throw failure;
          },
        );
      pending.set(library.name, request);
    }
    return request;
  };

  return {
    useScopedRequire(nextScopedRequire) {
      scopedRequire ??= nextScopedRequire;
    },
    loadLibrary,
    preloadLibraries: (libraries) => Promise.all(libraries.map(loadLibrary)),
    loadedLibrary(library) {
      if (!loaded.has(library.name)) {
        throw new Error(`[fast-serve] SPFx library ${describeLibrary(library)} was required before it was preloaded.`);
      }
      return loaded.get(library.name);
    },
    loadExternal,
    preloadExternals: (names) => Promise.all(names.map(loadExternal)),
    loadedExternal(name) {
      if (!loadedExternals.has(name)) {
        throw new Error(`[fast-serve] config/config.json external "${name}" was required before it was preloaded.`);
      }
      return loadedExternals.get(name);
    },
  };
}

const libraryLoaderHost = window as unknown as { __spfxFastServe?: LibraryLoaderGlobal };
libraryLoaderHost.__spfxFastServe ??= createLibraryLoader(__SPFX_LIBRARY_LOADER__);
