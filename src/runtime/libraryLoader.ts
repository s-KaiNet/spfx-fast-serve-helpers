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

function describeLibrary(library: LibraryReference): string {
  return `"${library.name}" (component ${library.id}, version ${library.version})`;
}

function createLibraryLoader(config: LibraryLoaderConfig): LibraryLoaderGlobal {
  const pending = new Map<string, Promise<unknown>>();
  const loaded = new Map<string, unknown>();
  let scopedRequire: LibraryScopedRequire | undefined;
  let componentLoader: Promise<SpComponentLoaderModule['SPComponentLoader']> | undefined;

  const getComponentLoader = () =>
    (componentLoader ??= new Promise((resolve, reject) => {
      if (!scopedRequire) {
        reject(new Error('the bundle shim has not received the RequireJS require yet'));
        return;
      }
      scopedRequire(
        [config.componentLoaderModule],
        (loaderModule) => {
          resolve((loaderModule as SpComponentLoaderModule).SPComponentLoader);
        },
        reject,
      );
    }));

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
            const failure = new Error(
              `[fast-serve] Cannot load SPFx library ${describeLibrary(library)} from SharePoint: ${describeLoadError(error)}`,
              { cause: error },
            );
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
  };
}

const libraryLoaderHost = window as unknown as { __spfxFastServe?: LibraryLoaderGlobal };
libraryLoaderHost.__spfxFastServe ??= createLibraryLoader(__SPFX_LIBRARY_LOADER__);
