export interface BundleShimConfig {
  bundleName: string;

  origin: string;

  entryPath: string;

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
}
