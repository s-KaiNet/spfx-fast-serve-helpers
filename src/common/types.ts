import webpack from 'webpack';

export type EntryPoints = Record<string, string>;

export type LocalizedResources = Record<string, string>;

export type ModulesMap = Record<string, {
  id: string;
  version: string;
  path: string;
  isBundle: boolean;
}>;

export type DynamicLibraryPluginOptions = {
  libraryName: string;
  modulesMap: ModulesMap;
}

export type ClearCssModulesPluginOptions = {
  rootFolder: string;
}

export type ApplySettings = (config: webpack.Configuration) => void;

export type ScriptResource = {
  type: 'path' | 'component' | 'localizedPath';
  path?: string;
  paths?: Record<string, string>;
}

export type ScriptResources = Record<string, ScriptResource>;

export type NodePackage = {
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>;
  scripts: Record<string, string>;
  version: string;
}
export type LoaderConfig = {
  internalModuleBaseUrls: string[];
  entryModuleId: string;
  scriptResources: ScriptResources;
}

export type Manifest = {
  id: string;
  alias: string;
  componentType: string;
  version: string;
  manifestVersion: number;
  loaderConfig: LoaderConfig;
}

export type SPFxConfig = {
  localizedResources: LocalizedResources;
  externals: Record<string, string | ExternalsObject>;
}

export type ExternalsObject = {
  path: string;
}

export type ResourceData = {
  path: string;
  fileName: string;
}

export type NgrokServeOptions = {
  host: string;
}

export type ServeConfigurations = {
  hostname: string;
  ipAddress: string;
  serveConfigurations: {
    [key: string]: {
      pageUrl: string,
      customActions?: any,
      fieldCustomizers?: any;
      formCustomizer?: any;
    }
  }
};
