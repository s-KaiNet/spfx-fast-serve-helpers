import { createRequire } from 'node:module';
import path from 'node:path';
import { Terminal, TerminalProviderSeverity, type ITerminal, type ITerminalProvider } from '@rushstack/terminal';
import type { Logger } from '../logger.js';

const CONFIG_FILE_PACKAGE = '@rushstack/heft-config-file';
const RIG_PACKAGE = '@rushstack/rig-package';
const PACKAGE_ANCHORS = ['@microsoft/spfx-web-build-rig', '@rushstack/heft'];

export type ProjectLoader = (request: string) => unknown;

export interface HeftConfigurationFile {
  projectRelativeFilePath: string;
  jsonSchemaObject: object;
  propertyInheritance?: Record<string, { inheritanceType: 'append' | 'merge' | 'replace' }>;
}

interface ProjectConfigurationFileInstance<T> {
  tryLoadConfigurationFileForProjectAsync(terminal: ITerminal, projectPath: string, rigConfig: unknown): Promise<T | undefined>;
}

interface ConfigFileModule {
  ProjectConfigurationFile: new <T>(options: HeftConfigurationFile) => ProjectConfigurationFileInstance<T>;
}

interface RigPackageModule {
  RigConfig: { loadForProjectFolderAsync(options: { projectFolderPath: string }): Promise<unknown> };
}

export function createProjectLoader(root: string): ProjectLoader {
  const projectRequire = createRequire(path.join(root, 'package.json'));
  const requires = [
    projectRequire,
    ...PACKAGE_ANCHORS.flatMap((anchor) => {
      try {
        return [createRequire(projectRequire.resolve(`${anchor}/package.json`))];
      } catch {
        return [];
      }
    }),
  ];
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

export async function loadHeftConfiguration<T>(
  root: string,
  load: ProjectLoader,
  terminal: ITerminal,
  file: HeftConfigurationFile,
): Promise<T | undefined> {
  const { ProjectConfigurationFile } = load(CONFIG_FILE_PACKAGE) as ConfigFileModule;
  const { RigConfig } = load(RIG_PACKAGE) as RigPackageModule;
  const configurationFile = new ProjectConfigurationFile<T>(file);
  const rigConfig = await RigConfig.loadForProjectFolderAsync({ projectFolderPath: root });
  return configurationFile.tryLoadConfigurationFileForProjectAsync(terminal, root, rigConfig);
}

export function createHeftTerminal(logger: Logger, label: string): ITerminal {
  const provider: ITerminalProvider = {
    supportsColor: false,
    eolCharacter: '\n',
    write(data, severity) {
      const message = data.trim();
      if (message === '') return;
      if (severity === TerminalProviderSeverity.error) logger.error(`${label}: ${message}`);
      else if (severity === TerminalProviderSeverity.warning) logger.warn(`${label}: ${message}`);
    },
  };
  return new Terminal(provider);
}

interface FormattedError {
  getFormattedErrorMessage(): string;
}

export function heftErrorMessage(error: unknown): string {
  if (isFormattedError(error)) return error.getFormattedErrorMessage();
  return error instanceof Error ? error.message : String(error);
}

function isFormattedError(error: unknown): error is FormattedError {
  return typeof error === 'object' && error !== null && typeof (error as Partial<FormattedError>).getFormattedErrorMessage === 'function';
}
