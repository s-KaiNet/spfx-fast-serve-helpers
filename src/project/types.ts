export interface PackageJson {
  name?: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface ServeConfig {
  port?: number;
  initialPage?: string;
}

export interface ComponentManifest {
  id: string;
  alias: string;
  componentType: string;
  version: string;
  [key: string]: unknown;
}

export interface SpfxComponent {
  bundleName: string;
  manifest: ComponentManifest;

  manifestFile: string;

  entryFile: string;

  exportName?: string;
}

export interface SpfxBundle {
  name: string;
  components: SpfxComponent[];
}

export interface SpfxLibrary {
  packageName: string;
  id: string;
  version: string;
  packageDir: string;
}

export interface LocalizedResource {
  name: string;

  file: string;
  locale: string;
}
