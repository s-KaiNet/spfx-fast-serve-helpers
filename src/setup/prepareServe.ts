import path from 'node:path';
import { legacyOptionsFileHint, loadOptionsFile, OPTIONS_FILE, resolveOptions, type FastServeOptions, type ResolvedOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { packageName, packageVersion } from '../packageInfo.js';
import { assertSupportedSpfxVersion, createProject, findSpfxVersion, readLibraryComponent, type InstalledSpfxVersion, type SpfxProject } from '../project/index.js';
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
  if (project.components().length === 0) throw new Error(noComponentsMessage(project));
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

function noComponentsMessage(project: SpfxProject): string {
  const library = readLibraryComponent(project.root, project.packageJson().version);
  if (library === undefined) return 'No web parts, extensions or Adaptive Card Extensions found in config/config.json bundles.';
  return (
    `${project.packageJson().name ?? library.alias} is an SPFx library project: run fast-serve in a consumer project that depends on it ` +
    '(npm link, npm "file:", pnpm "link:"/"workspace:" or a workspace). fast-serve there compiles the library\'s src into the consumer\'s bundles, with hot updates.'
  );
}
