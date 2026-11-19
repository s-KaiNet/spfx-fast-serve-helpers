import { createRequire } from 'node:module';
import type { RuleSetRule, RuleSetUseItem } from '@rspack/core';
import type { SassConfiguration } from '../project/index.js';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { resolveFromProject } from '../utils/heftProject.js';
import { packageFile } from '../utils/packageFile.js';
import { createCssClassNameGenerator } from './cssClassName.js';

const SP_CSS_LOADER = '@microsoft/sp-css-loader';
const SASS_PACKAGES = ['sass-embedded', 'sass'];
const MODULE_CSS = /\.module(?:\.scss)?\.css$/i;
const GLOBAL_CSS = /(?<!\.module(?:\.scss)?)\.css$/i;
const MODULE_SCSS = /\.module\.scss$/i;
const GLOBAL_SCSS = /(?<!\.module)\.scss$/i;

interface SassPackage {
  NodePackageImporter?: new (entryPointDirectory: string) => object;
}

export async function stylesContribution({ root, project, logger }: BuildContext): Promise<ConfigContribution> {
  const spCssLoader = resolveFromProject(root, SP_CSS_LOADER);
  if (spCssLoader === undefined) {
    logger.warn(`${SP_CSS_LOADER} was not found (it ships with @microsoft/spfx-heft-plugins): styles can't be compiled, reinstall the project dependencies`);
    return {};
  }
  const generateCssClassName = createCssClassNameGenerator();
  const moduleCss: RuleSetUseItem = { loader: spCssLoader, options: { async: true, production: false, generateCssClassName } };
  const globalCss: RuleSetUseItem = { loader: spCssLoader, options: { async: true, production: false } };
  const sass = sassLoader(root, await project.sassConfiguration().catch((): SassConfiguration => ({})));
  const hotStyles = hotStylesLoader();
  const rules: RuleSetRule[] = [
    { test: MODULE_CSS, use: [hotStyles, moduleCss], type: 'javascript/auto' },
    { test: GLOBAL_CSS, use: [hotStyles, globalCss], type: 'javascript/auto' },
  ];
  if (sass) {
    rules.push({ test: MODULE_SCSS, use: [hotStyles, moduleCss, sass], type: 'javascript/auto' });
    rules.push({ test: GLOBAL_SCSS, use: [hotStyles, globalCss, sass], type: 'javascript/auto' });
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

function sassLoader(root: string, { silenceDeprecations }: SassConfiguration): RuleSetUseItem | undefined {
  const found = findSass(root);
  if (!found) return undefined;
  const { NodePackageImporter } = found.sass;
  return {
    loader: createRequire(import.meta.url).resolve('sass-loader'),
    options: {
      implementation: found.sass,
      api: 'modern-compiler',
      sassOptions: {
        ...(silenceDeprecations && { silenceDeprecations: [...silenceDeprecations] }),
        ...(NodePackageImporter && { importers: [new NodePackageImporter(root)] }),
      },
    },
  };
}

function findSass(root: string): { file: string; sass: SassPackage } | undefined {
  for (const packageName of SASS_PACKAGES) {
    const file = resolveFromProject(root, packageName);
    if (file !== undefined) return { file, sass: createRequire(file)(file) as SassPackage };
  }
  return undefined;
}
