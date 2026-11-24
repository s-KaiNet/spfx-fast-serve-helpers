import { createRequire } from 'node:module';
import path from 'node:path';
import type { RuleSetRule, RuleSetUseItem } from '@rspack/core';
import type { ConfigContribution, Feature, FeatureContext } from '../../../bundler/featureApi/index.js';
import { resolveFromProject, type SassConfiguration } from '../../../project/index.js';
import { packageFile } from '../../../shared/packageFile.js';
import { createCssClassNameGenerator, heftCssFileMapper } from './cssClassName.js';
import { createSassPackageFolderImporter } from './sassPackageImporter.js';
import { scssTypingsOnServerStart } from './scssTypings/index.js';

const SP_CSS_LOADER = '@microsoft/sp-css-loader';
const SASS_PACKAGES = ['sass-embedded', 'sass'];
const MODULE_CSS = /(?<!\.global)\.css$/i;
const GLOBAL_CSS = /\.global\.css$/i;
const MODULE_SASS = /(?<!\.global)\.s[ac]ss$/i;
const GLOBAL_SASS = /\.global\.s[ac]ss$/i;

export interface SassPackage {
  NodePackageImporter?: new (entryPointDirectory: string) => object;
}

export const stylesFeature: Feature = { name: 'styles', contribute: stylesContribution };

async function stylesContribution(context: FeatureContext): Promise<ConfigContribution> {
  const { root, project, logger, page } = context;
  const sassConfiguration = await project.sassConfiguration().catch((): SassConfiguration => ({}));
  page.onServerStarted(scssTypingsOnServerStart(context, path.resolve(root, sassConfiguration.srcFolder ?? 'src')));
  const spCssLoader = resolveFromProject(root, SP_CSS_LOADER);
  if (spCssLoader === undefined) {
    logger.warn(`${SP_CSS_LOADER} was not found (it ships with @microsoft/spfx-heft-plugins): styles can't be compiled, reinstall the project dependencies`);
    return {};
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
  return { rules, extensions: ['.css'] };
}

function hotStylesLoader(): RuleSetUseItem {
  return {
    loader: packageFile('./hotStylesLoader', import.meta.url),
    options: { runtime: packageFile('./runtime/hotStyles', import.meta.url) },
  };
}

function sassLoader(root: string, configuration: SassConfiguration): RuleSetUseItem | undefined {
  const file = findSass(root);
  if (file === undefined) return undefined;
  let sass: SassPackage | undefined;
  const loadSass = (): SassPackage => (sass ??= createRequire(file)(file) as SassPackage);
  let options: Record<string, unknown> | undefined;
  return {
    loader: createRequire(import.meta.url).resolve('sass-loader'),
    options: {
      get implementation() {
        return loadSass();
      },
      api: 'modern-compiler',
      sassOptions: () => (options ??= sassOptions(root, configuration, loadSass())),
    },
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
    importers: [...(NodePackageImporter ? [new NodePackageImporter(root)] : []), createSassPackageFolderImporter(root)],
  };
}

function findSass(root: string): string | undefined {
  for (const packageName of SASS_PACKAGES) {
    const file = resolveFromProject(root, packageName);
    if (file !== undefined) return file;
  }
  return undefined;
}
