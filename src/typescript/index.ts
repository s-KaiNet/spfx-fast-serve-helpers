import type { RuleSetRule, SwcLoaderOptions } from '@rspack/core';
import type { ConfigContribution } from '../rspack/contribution.js';

const NODE_MODULES = /[\\/]node_modules[\\/]/;

export const SWC_TARGET = 'es2020';

export function typescriptContribution(): ConfigContribution {
  return {
    rules: [swcRule(/\.ts$/, false), swcRule(/\.tsx$/, true)],
    extensions: ['.ts', '.tsx'],
  };
}

function swcRule(test: RegExp, tsx: boolean): RuleSetRule {
  const options: SwcLoaderOptions = {
    jsc: {
      parser: { syntax: 'typescript', tsx, decorators: true },
      transform: {
        legacyDecorator: true,
        useDefineForClassFields: false,
        react: { runtime: 'classic', development: true, refresh: true },
      },
      target: SWC_TARGET,
    },
    sourceMaps: true,
  };
  return { test, exclude: NODE_MODULES, loader: 'builtin:swc-loader', options, type: 'javascript/auto' };
}
