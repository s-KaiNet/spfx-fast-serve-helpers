export interface ProjectLogger {
  warn: (message: string) => void;
}

export type ProjectRole = 'consumer' | 'library';

export interface PackageJson {
  name?: string;
  version: string;
  dependencies: Record<string, string>;
  devDependencies: Record<string, string>;
}

export interface ServeConfig {
  port?: number;
  initialPage?: string;
  serveConfigurations?: Record<string, ServeConfiguration>;
}

export interface ServeConfiguration {
  pageUrl?: string;
  customActions?: Record<string, CustomAction>;
  fieldCustomizers?: Record<string, FieldCustomizer>;
  formCustomizer?: Record<string, unknown>;
}

export interface CustomAction {
  location: string;
  properties?: Record<string, unknown>;
}

export interface FieldCustomizer {
  id: string;
  properties?: Record<string, unknown>;
}

export interface ComponentManifest {
  id: string;
  alias: string;
  componentType: string;
  extensionType?: string;
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

export interface LocalLibraryPackage {
  packageName: string;
  root: string;
}

export interface LocalizedResource {
  name: string;

  file: string;
  locale: string;
}

export type ConfigExternalSource = { type: 'url'; url: string } | { type: 'file'; file: string };

export interface ConfigExternal {
  name: string;
  source: ConfigExternalSource;
  globalName?: string;
  globalDependencies?: string[];
}
