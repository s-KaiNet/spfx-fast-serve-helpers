export interface BundleShimConfig {
  bundleName: string;

  origin: string;

  entryPath: string;

  components: ShimComponent[];
  externals: ShimExternalsConfig;
}

export interface ShimComponent {
  alias: string;

  moduleId: string;
}

export interface ShimExternalsConfig {
  preload: string[];
}

export interface FastServeGlobal {
  externals: Record<string, unknown>;
}

