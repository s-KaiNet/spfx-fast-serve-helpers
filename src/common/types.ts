import webpack from 'webpack';
import { Settings } from './settings';

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

export type ApplySettings = (config: webpack.Configuration, settings: Settings['serve']) => void;

export type ScriptResource = {
  type: 'path' | 'component' | 'localizedPath';
  path?: string;
  paths?: Record<string, string>;
}

export type ScriptResources = Record<string, ScriptResource>;

export type NodePackage = {
  devDependencies: Record<string, string>;
  dependencies: Record<string, string>
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
}