export type EntryPoints = Record<string, string>;

export type LocalizedResources = Record<string, string>;

export type ModulesMap = Record<string, {
  id: string;
  version: string;
  path: string;
}>;

export type DynamicLibraryPluginOptions = {
  libraryName: string;
  modulesMap: ModulesMap;
}

export type ClearCssModulesPluginOptions = {
  rootFolder: string;
  deleted: boolean;
}