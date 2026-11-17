export interface BundleShimConfig {
  bundleName: string;

  origin: string;

  entryPath: string;

  statusPath: string;

  browserErrorsPath: string;

  components: ShimComponent[];
}

export interface ShimComponent {
  id: string;
  alias: string;

  moduleId: string;
}

export interface SpfxLibraryReference {
  name: string;
  id: string;
  version: string;
}

export interface LibraryLoaderConfig {
  componentLoaderModule: string;
}

export type ScopedRequire = (names: string[], onLoad: (...modules: unknown[]) => void, onError: (error: unknown) => void) => void;

export interface FastServeGlobal {
  useScopedRequire(scopedRequire: ScopedRequire): void;

  loadLibrary(library: SpfxLibraryReference): Promise<unknown>;

  preloadLibraries(libraries: readonly SpfxLibraryReference[]): Promise<unknown>;

  loadedLibrary(library: SpfxLibraryReference): unknown;

  loadExternal(name: string): Promise<unknown>;

  preloadExternals(names: readonly string[]): Promise<unknown>;

  loadedExternal(name: string): unknown;
}

export interface LastServerError {
  message: string;

  location?: string;
  plugin?: string;
}

export interface ServerStatus {
  error: LastServerError | null;

  fileRevision: number;
}

export type BrowserErrorKind = 'error' | 'unhandled-rejection' | 'console-error';

export interface BrowserErrorReport {
  kind: BrowserErrorKind;
  name: string;
  message: string;

  stack: string;

  callStack: string;
}
