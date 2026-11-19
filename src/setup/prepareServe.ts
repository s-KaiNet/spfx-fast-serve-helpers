import path from 'node:path';
import { legacyOptionsFileHint, loadOptionsFile, resolveOptions, type FastServeOptions, type ResolvedOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { packageName, packageVersion } from '../packageInfo.js';
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
  const project = createProject(projectRoot, logger);
  const file = loadOptionsFile(projectRoot, logger.warn);
  const options = resolveOptions({ cli, file, defaults: project.serveConfig() }, env);
  if (project.components().length === 0) {
    throw new Error('No web parts, extensions or Adaptive Card Extensions found in config/config.json bundles (library components are not supported yet).');
  }
  for (const warning of options.warnings) logger.warn(warning);
  if (options.serveConfiguration) {
    const { name, ...configuration } = options.serveConfiguration;
    for (const warning of serveConfigurationWarnings(name, configuration, project.components())) logger.warn(warning);
  }
  return { root: projectRoot, spfxVersion, project, options };
}
