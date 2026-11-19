import { createRequire } from 'node:module';
import path from 'node:path';
import type { RuleSetRule, RuleSetUseItem } from '@rspack/core';
import type { SassConfiguration } from '../project/index.js';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { resolveFromProject } from '../utils/heftProject.js';
import { packageFile } from '../utils/packageFile.js';
import { createCssClassNameGenerator, heftCssFileMapper } from './cssClassName.js';
import { scssTypingsOnServerStart } from './scssTypings/index.js';

const SP_CSS_LOADER = '@microsoft/sp-css-loader';
const SASS_PACKAGES = ['sass-embedded', 'sass'];
const MODULE_CSS = /\.module(?:\.scss)?\.css$/i;
const GLOBAL_CSS = /(?<!\.module(?:\.scss)?)\.css$/i;
const MODULE_SASS = /\.module\.s[ac]ss$/i;
const GLOBAL_SASS = /(?<!\.module)\.s[ac]ss$/i;

export interface SassPackage {
  NodePackageImporter?: new (entryPointDirectory: string) => object;
}

export async function stylesContribution(context: BuildContext): Promise<ConfigContribution> {
  const { root, project, logger } = context;
  const sassConfiguration = await project.sassConfiguration().catch((): SassConfiguration => ({}));
  const serverStarted = [scssTypingsOnServerStart(context, path.resolve(root, sassConfiguration.srcFolder ?? 'src'))];
  const spCssLoader = resolveFromProject(root, SP_CSS_LOADER);
  if (spCssLoader === undefined) {
    logger.warn(`${SP_CSS_LOADER} was not found (it ships with @microsoft/spfx-heft-plugins): styles can't be compiled, reinstall the project dependencies`);
    return { serverStarted };
  }
  const generateCssClassName = createCssClassNameGenerator(heftCssFileMapper(root, sassConfiguration));
  const moduleCss: RuleSetUseItem = { loader: spCssLoader, options: { async: true, production: false, generateCssClassName } };
  const globalCss: RuleSetUseItem = { loader: spCssLoader, options: { async: true, production: false } };
  const sass = sassLoader(root, sassConfiguration);
  const hotStyles = hotStylesLoader();
  const rules: RuleSetRule[] = [
    { test: MODULE_CSS, use: [hotStyles, moduleCss], type: 'javascript/auto' },
    { test: GLOBAL_CSS, use: [hotStyles, globalCss], type: 'javascript/auto' },
  ];
  if (sass) {
    rules.push({ test: MODULE_SASS, use: [hotStyles, moduleCss, sass], type: 'javascript/auto' });
    rules.push({ test: GLOBAL_SASS, use: [hotStyles, globalCss, sass], type: 'javascript/auto' });
  } else {
    logger.warn('neither sass-embedded nor sass was found in the project: .scss files can\'t be compiled');
  }
  return { rules, extensions: ['.css'], serverStarted };
}

function hotStylesLoader(): RuleSetUseItem {
  return {
    loader: packageFile('./hotStylesLoader', import.meta.url),
    options: { runtime: packageFile('./runtime/hotStyles', import.meta.url) },
  };
}

function sassLoader(root: string, configuration: SassConfiguration): RuleSetUseItem | undefined {
  const found = findSass(root);
  if (!found) return undefined;
  return {
    loader: createRequire(import.meta.url).resolve('sass-loader'),
    options: { implementation: found.sass, api: 'modern-compiler', sassOptions: sassOptions(root, configuration, found.sass) },
  };
}

export function sassOptions(
  root: string,
  { silenceDeprecations, ignoreDeprecationsInDependencies, loadPaths }: SassConfiguration,
  { NodePackageImporter }: SassPackage,
): Record<string, unknown> {
  return {
    ...(silenceDeprecations && { silenceDeprecations: [...silenceDeprecations] }),
    ...(ignoreDeprecationsInDependencies && { quietDeps: true }),
    ...(loadPaths && { loadPaths: loadPaths.map((folder) => path.resolve(root, folder)) }),
    ...(NodePackageImporter && { importers: [new NodePackageImporter(root)] }),
  };
}

function findSass(root: string): { file: string; sass: SassPackage } | undefined {
  for (const packageName of SASS_PACKAGES) {
    const file = resolveFromProject(root, packageName);
    if (file !== undefined) return { file, sass: createRequire(file)(file) as SassPackage };
  }
  return undefined;
}
