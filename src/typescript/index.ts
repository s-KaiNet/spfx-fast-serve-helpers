import path from 'node:path';
import type { RspackPluginInstance, RuleSetCondition, RuleSetRule, SwcLoaderOptions } from '@rspack/core';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { isInside } from '../utils/paths.js';
import { classTransformDifference, classTransformOptions, type ClassTransformOptions } from './compilerOptions.js';
import { AmbientConstEnums, constEnumCheckRule, ConstEnumsPlugin } from './constEnums/index.js';
import { TypeOnlyNamesPlugin } from './typeOnlyNames.js';

export { classTransformDifference, classTransformOptions, type ClassTransformOptions } from './compilerOptions.js';

const NODE_MODULES = /[\\/]node_modules[\\/]/;
const PROJECT_SCRIPT = /\.[cm]?[jt]sx?$/i;

export const SWC_TARGET = 'es2020';

interface CodeRoot {
  root: string;
  tsconfigFile: string | undefined;
}

export function typescriptContribution({ root, project, logger }: Pick<BuildContext, 'root' | 'project' | 'logger'>): ConfigContribution {
  const classes = classTransformOptions(project.tsconfigCompilerOptions());
  const libraries = project.localLibraries();
  for (const library of libraries) {
    const difference = classTransformDifference(classes, classTransformOptions(library.project.tsconfigCompilerOptions()));
    if (difference !== undefined) {
      logger.warn(`${library.packageName}: its tsconfig compiles classes differently (${difference}); fast-serve compiles the library's src with the project's settings`);
    }
  }
  const codeRoots: CodeRoot[] = [
    { root, tsconfigFile: project.tsconfigPaths()?.files[0] },
    ...libraries.map((library) => ({ root: library.root, tsconfigFile: library.project.tsconfigPaths()?.files[0] })),
  ];
  const rules = [swcRule(/\.ts$/, false, classes), swcRule(/\.tsx$/, true, classes)];
  const plugins: RspackPluginInstance[] = [];
  for (const codeRoot of codeRoots) {
    const exclude = [NODE_MODULES, ...nestedRoots(codeRoot.root, codeRoots)];
    if (codeRoot.tsconfigFile !== undefined) rules.push(tsconfigPathsRule(codeRoot.root, codeRoot.tsconfigFile, exclude));
    const ambientEnums = new AmbientConstEnums(path.join(codeRoot.root, 'src'));
    rules.push(constEnumCheckRule(codeRoot.root, ambientEnums, exclude, root));
    plugins.push(new ConstEnumsPlugin(codeRoot.root, ambientEnums, root));
  }
  plugins.push(new TypeOnlyNamesPlugin(codeRoots.map((codeRoot) => codeRoot.root)));
  return { rules, extensions: ['.ts', '.tsx'], plugins };
}

function nestedRoots(root: string, codeRoots: readonly CodeRoot[]): string[] {
  return codeRoots.filter((other) => other.root !== root && isInside(root, other.root)).map((other) => other.root);
}

function tsconfigPathsRule(root: string, configFile: string, exclude: RuleSetCondition): RuleSetRule {
  return { test: PROJECT_SCRIPT, include: root, exclude, resolve: { tsConfig: { configFile } } };
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
