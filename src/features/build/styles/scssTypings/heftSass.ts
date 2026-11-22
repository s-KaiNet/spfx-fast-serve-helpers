import { availableParallelism } from 'node:os';
import path from 'node:path';
import type { Logger } from '../../../../shared/logger.js';
import { createHeftTerminal, createProjectLoader, heftErrorMessage, type SassConfiguration } from '../../../../project/index.js';

const SASS_PLUGIN_PACKAGE = '@rushstack/heft-sass-plugin';
const TYPINGS_LABEL = 'SCSS typings';

export interface HeftSassProcessor {
  readonly ignoredFileGlobs: string[] | undefined;
  readonly inputFileGlob: string;
  readonly sourceFolderPath: string;
  compileFilesAsync(files: Set<string>): Promise<void>;
  loadCacheAsync?(cacheFolder: string): Promise<void>;
}

export interface HeftSassTypings {
  processor: HeftSassProcessor;
  typingsFolders: string[];
  stagingFolder: string;
}

export interface HeftSassFolders {
  stagingFolder: string;
  cacheFolder?: string;
}

interface SassProcessorModule {
  SassProcessor: new (options: Record<string, unknown>) => HeftSassProcessor;
}

export async function createHeftSassTypings(root: string, logger: Logger, configuration: SassConfiguration, { stagingFolder, cacheFolder }: HeftSassFolders): Promise<HeftSassTypings> {
  const load = createProjectLoader(root);
  const { SassProcessor } = load(`${SASS_PLUGIN_PACKAGE}/lib/SassProcessor`) as SassProcessorModule;
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
    dtsOutputFolders: [stagingFolder],
    exportAsDefault: configuration.exportAsDefault ?? true,
    fileExtensions: configuration.fileExtensions,
    nonModuleFileExtensions: configuration.nonModuleFileExtensions,
    excludeFiles: configuration.excludeFiles,
    loadPaths: configuration.loadPaths?.map(resolveFolder),
    resolveBareSpecifiersAsPackages: configuration.resolveBareSpecifiersAsPackages,
    silenceDeprecations: configuration.silenceDeprecations,
  });
  if (cacheFolder !== undefined) await processor.loadCacheAsync?.(cacheFolder);
  return { processor, typingsFolders, stagingFolder };
}
