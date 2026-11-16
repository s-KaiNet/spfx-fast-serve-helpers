import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { Logger } from '../../logger.js';
import { createHeftTerminal, createProjectLoader, heftErrorMessage, loadHeftConfiguration, type ProjectLoader } from '../../utils/heftProject.js';

const SASS_PLUGIN_PACKAGE = '@rushstack/heft-sass-plugin';
const TYPINGS_LABEL = 'SCSS typings';
const SASS_CONFIG_FILE = 'config/sass.json';

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
}

export interface HeftSassProcessor {
  readonly ignoredFileGlobs: string[] | undefined;
  readonly inputFileGlob: string;
  readonly sourceFolderPath: string;
  compileFilesAsync(files: Set<string>): Promise<void>;
}

export interface HeftSassTypings {
  processor: HeftSassProcessor;
  typingsFolders: string[];
}

interface SassProcessorModule {
  SassProcessor: new (options: Record<string, unknown>) => HeftSassProcessor;
}

export async function createHeftSassTypings(root: string, logger: Logger): Promise<HeftSassTypings> {
  const load = createProjectLoader(root);
  const { SassProcessor } = load(`${SASS_PLUGIN_PACKAGE}/lib/SassProcessor`) as SassProcessorModule;
  const configuration = await loadSassConfiguration(root, load, logger);
  const resolveFolder = (folder: string) => path.resolve(root, folder);
  const typingsFolders = [configuration.generatedTsFolder ?? 'temp/sass-ts', ...(configuration.secondaryGeneratedTsFolders ?? [])].map(resolveFolder);

  const processor = new SassProcessor({
    buildFolder: root,
    concurrency: availableParallelism(),
    logger: {
      terminal: createHeftTerminal(logger, TYPINGS_LABEL),
      emitError: (error: unknown) => {
        logger.error(`${TYPINGS_LABEL}: ${heftErrorMessage(error)}`);
      },
      emitWarning: (warning: unknown) => {
        logger.warn(`${TYPINGS_LABEL}: ${heftErrorMessage(warning)}`);
      },
    },
    srcFolder: resolveFolder(configuration.srcFolder ?? 'src'),
    dtsOutputFolders: typingsFolders,
    exportAsDefault: configuration.exportAsDefault ?? true,
    fileExtensions: configuration.fileExtensions,
    nonModuleFileExtensions: configuration.nonModuleFileExtensions,
    excludeFiles: configuration.excludeFiles,
    loadPaths: configuration.loadPaths?.map(resolveFolder),
    resolveBareSpecifiersAsPackages: configuration.resolveBareSpecifiersAsPackages,
    silenceDeprecations: configuration.silenceDeprecations,
  });
  return { processor, typingsFolders };
}

async function loadSassConfiguration(root: string, load: ProjectLoader, logger: Logger): Promise<SassConfiguration> {
  const jsonSchemaObject = load(`${SASS_PLUGIN_PACKAGE}/lib/schemas/heft-sass-plugin.schema.json`) as object;
  const configuration = await loadHeftConfiguration<SassConfiguration>(root, load, createHeftTerminal(logger, TYPINGS_LABEL), {
    projectRelativeFilePath: SASS_CONFIG_FILE,
    jsonSchemaObject,
  });
  return configuration ?? {};
}
