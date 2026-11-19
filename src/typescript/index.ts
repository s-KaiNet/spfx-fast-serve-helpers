import path from 'node:path';
import type { RuleSetRule, SwcLoaderOptions } from '@rspack/core';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { classTransformOptions, type ClassTransformOptions } from './compilerOptions.js';
import { AmbientConstEnums, constEnumCheckRule, ConstEnumsPlugin } from './constEnums/index.js';
import { TypeOnlyNamesPlugin } from './typeOnlyNames.js';

export { classTransformOptions, type ClassTransformOptions } from './compilerOptions.js';

const NODE_MODULES = /[\\/]node_modules[\\/]/;
const PROJECT_SCRIPT = /\.[cm]?[jt]sx?$/i;

export const SWC_TARGET = 'es2020';

export function typescriptContribution({ root, project }: Pick<BuildContext, 'root' | 'project'>): ConfigContribution {
  const classes = classTransformOptions(project.tsconfigCompilerOptions());
  const rules = [swcRule(/\.ts$/, false, classes), swcRule(/\.tsx$/, true, classes)];
  const tsconfigFile = project.tsconfigPaths()?.files[0];
  if (tsconfigFile !== undefined) rules.push(tsconfigPathsRule(root, tsconfigFile));
  const ambientEnums = new AmbientConstEnums(path.join(root, 'src'));
  rules.push(constEnumCheckRule(root, ambientEnums, NODE_MODULES));
  return {
    rules,
    extensions: ['.ts', '.tsx'],
    plugins: [new ConstEnumsPlugin(root, ambientEnums), new TypeOnlyNamesPlugin(root)],
  };
}

function tsconfigPathsRule(root: string, configFile: string): RuleSetRule {
  return { test: PROJECT_SCRIPT, include: root, exclude: NODE_MODULES, resolve: { tsConfig: { configFile } } };
}

function swcRule(test: RegExp, tsx: boolean, { legacyDecorators, decoratorMetadata, useDefineForClassFields }: ClassTransformOptions): RuleSetRule {
  const options: SwcLoaderOptions = {
    jsc: {
      parser: { syntax: 'typescript', tsx, decorators: true },
      transform: {
        legacyDecorator: legacyDecorators,
        decoratorMetadata,
        ...(legacyDecorators ? {} : { decoratorVersion: '2022-03' as const }),
        useDefineForClassFields,
        react: { runtime: 'classic', development: true, refresh: true },
      },
      target: SWC_TARGET,
    },
    sourceMaps: true,
  };
  return { test, exclude: NODE_MODULES, loader: 'builtin:swc-loader', options, type: 'javascript/auto' };
}
