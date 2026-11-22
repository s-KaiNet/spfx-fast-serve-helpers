import { createHeftTerminal, createProjectLoader, loadHeftConfiguration } from '../heft/heftProject.js';
import type { ProjectLogger } from '../types.js';

const SASS_PLUGIN_PACKAGE = '@rushstack/heft-sass-plugin';
export const SASS_CONFIG_FILE = 'config/sass.json';

export interface SassConfiguration {
  srcFolder?: string;
  generatedTsFolder?: string;
  secondaryGeneratedTsFolders?: string[];
  exportAsDefault?: boolean;
  fileExtensions?: string[];
  nonModuleFileExtensions?: string[];
  excludeFiles?: string[];
  loadPaths?: string[];
  resolveBareSpecifiersAsPackages?: boolean;
  silenceDeprecations?: string[];
  ignoreDeprecationsInDependencies?: boolean;
  cssOutputFolders?: (string | { folder: string })[];
  doNotTrimOriginalFileExtension?: boolean;
  sourceMap?: boolean;
}

export async function loadSassConfiguration(root: string, logger: ProjectLogger): Promise<SassConfiguration> {
  const load = createProjectLoader(root);
  const jsonSchemaObject = load(`${SASS_PLUGIN_PACKAGE}/lib/schemas/heft-sass-plugin.schema.json`) as object;
  const terminalLogger = { info: () => undefined, warn: logger.warn, error: logger.warn };
  const configuration = await loadHeftConfiguration<SassConfiguration>(root, load, createHeftTerminal(terminalLogger, SASS_CONFIG_FILE), {
    projectRelativeFilePath: SASS_CONFIG_FILE,
    jsonSchemaObject,
  });
  return configuration ?? {};
}
