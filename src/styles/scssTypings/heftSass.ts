import { createRequire } from 'node:module';
import { availableParallelism } from 'node:os';
import path from 'node:path';
import { Terminal, TerminalProviderSeverity, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';
import type { Logger } from '../../logger.js';

const SASS_PLUGIN_PACKAGE = '@rushstack/heft-sass-plugin';
const CONFIG_FILE_PACKAGE = '@rushstack/heft-config-file';
const RIG_PACKAGE = '@rushstack/rig-package';
const PACKAGE_ANCHORS = ['@microsoft/spfx-web-build-rig', '@rushstack/heft'];
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

interface ProjectConfigurationFileInstance {
  tryLoadConfigurationFileForProjectAsync(terminal: ITerminal, projectPath: string, rigConfig: unknown): Promise<SassConfiguration | undefined>;
}

interface ConfigFileModule {
  ProjectConfigurationFile: new (options: { projectRelativeFilePath: string; jsonSchemaObject: object }) => ProjectConfigurationFileInstance;
}

interface RigPackageModule {
  RigConfig: { loadForProjectFolderAsync(options: { projectFolderPath: string }): Promise<unknown> };
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
      terminal: createTerminal(logger),
      emitError: (error: unknown) => {
        logger.error(`SCSS typings: ${errorMessage(error)}`);
      },
      emitWarning: (warning: unknown) => {
        logger.warn(`SCSS typings: ${errorMessage(warning)}`);
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
  const { ProjectConfigurationFile } = load(CONFIG_FILE_PACKAGE) as ConfigFileModule;
  const { RigConfig } = load(RIG_PACKAGE) as RigPackageModule;
  const jsonSchemaObject = load(`${SASS_PLUGIN_PACKAGE}/lib/schemas/heft-sass-plugin.schema.json`) as object;
  const configurationFile = new ProjectConfigurationFile({ projectRelativeFilePath: SASS_CONFIG_FILE, jsonSchemaObject });
  const rigConfig = await RigConfig.loadForProjectFolderAsync({ projectFolderPath: root });
  return (await configurationFile.tryLoadConfigurationFileForProjectAsync(createTerminal(logger), root, rigConfig)) ?? {};
}

type ProjectLoader = (request: string) => unknown;

function createProjectLoader(root: string): ProjectLoader {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const requires = [projectRequire, ...PACKAGE_ANCHORS.flatMap((anchor) => {
    try {
      return [createRequire(projectRequire.resolve(`${anchor}/package.json`))];
    } catch {
      return [];
    }
  })];

  return (request) => {
    for (const candidate of requires) {
      let resolved: string;
      try {
        resolved = candidate.resolve(request);
      } catch {
        continue;
      }
      return candidate(resolved) as unknown;
    }
    throw new Error(`${request} was not found from ${root} (it ships with the SPFx build rig): reinstall the project dependencies`);
  };
}

function createTerminal(logger: Logger): ITerminal {
  const provider: ITerminalProvider = {
    supportsColor: false,
    eolCharacter: '\n',
    write(data, severity) {
      const message = data.trim();
      if (message === '') return;
      if (severity === TerminalProviderSeverity.error) logger.error(`SCSS typings: ${message}`);
      else if (severity === TerminalProviderSeverity.warning) logger.warn(`SCSS typings: ${message}`);
    },
  };
  return new Terminal(provider);
}

interface FormattedError {
  getFormattedErrorMessage(): string;
}

function errorMessage(error: unknown): string {
  if (isFormattedError(error)) return error.getFormattedErrorMessage();
  return error instanceof Error ? error.message : String(error);
}

function isFormattedError(error: unknown): error is FormattedError {
  return typeof error === 'object' && error !== null && typeof (error as Partial<FormattedError>).getFormattedErrorMessage === 'function';
}
