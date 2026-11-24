import path from 'node:path';
import { legacyOptionsFileHint, loadOptionsFile, OPTIONS_FILE, resolveOptions, type FastServeOptions, type ResolvedOptions } from '../config/index.js';
import type { Logger } from '../shared/logger.js';
import { packageName, packageVersion } from '../shared/packageInfo.js';
import { assertSupportedSpfxVersion, createProject, findSpfxVersion, type InstalledSpfxVersion, type SpfxProject } from '../project/index.js';
import { serveConfigurationWarnings } from './serveConfigurationWarnings.js';

export interface ServeSetup {
  root: string;
  spfxVersion: InstalledSpfxVersion;
  project: SpfxProject;
  options: ResolvedOptions;
}

export interface PrepareServeOptions {
  root: string;
  cli?: FastServeOptions;
  logger: Logger;
  env?: NodeJS.ProcessEnv;
}

export function prepareServe({ root, cli = {}, logger, env = process.env }: PrepareServeOptions): ServeSetup {
  const projectRoot = path.resolve(root);
  const spfxVersion = findSpfxVersion(projectRoot);
  assertSupportedSpfxVersion(spfxVersion, { name: packageName, version: packageVersion });
  const legacyOptionsHint = legacyOptionsFileHint(projectRoot);
  if (legacyOptionsHint) logger.warn(legacyOptionsHint);
  const file = loadOptionsFile(projectRoot, logger.warn);
  const project = createProject(projectRoot, logger, { deployedLibraries: file.deployedLibraries ?? [] });
  const options = resolveOptions({ cli, file, defaults: project.serveConfig() }, env);
  if (project.components().length === 0) throw new Error(NO_COMPONENTS_MESSAGE);
  for (const name of file.deployedLibraries ?? []) {
    if (!project.libraries().has(name)) logger.warn(`${OPTIONS_FILE}: "deployedLibraries" lists "${name}", which is not an SPFx library dependency of this project`);
  }
  for (const warning of options.warnings) logger.warn(warning);
  if (options.serveConfiguration) {
    const { name, ...configuration } = options.serveConfiguration;
    for (const warning of serveConfigurationWarnings(name, configuration, project.components())) logger.warn(warning);
  }
  return { root: projectRoot, spfxVersion, project, options };
}

const NO_COMPONENTS_MESSAGE = 'No web parts, extensions, Adaptive Card Extensions or library components found in config/config.json bundles.';
