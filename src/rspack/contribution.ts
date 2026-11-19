import type { DevServerMiddlewareHandler, EntryObject, Plugin, RuleSetRule } from '@rspack/core';

export interface ServerMiddleware {
  name: string;
  middleware: DevServerMiddlewareHandler;
}

export interface ConfigContribution {
  entry?: EntryObject;
  rules?: RuleSetRule[];
  plugins?: Plugin[];
  alias?: Record<string, string>;
  extensions?: string[];
  externals?: string[];
  middlewares?: ServerMiddleware[];
}

export interface MergedContribution {
  entry: EntryObject;
  rules: RuleSetRule[];
  plugins: Plugin[];
  alias: Record<string, string>;
  extensions: string[];
  externals: string[];
  middlewares: ServerMiddleware[];
}

export function mergeContributions(contributions: readonly ConfigContribution[]): MergedContribution {
  const merged: MergedContribution = { entry: {}, rules: [], plugins: [], alias: {}, extensions: [], externals: [], middlewares: [] };
  for (const contribution of contributions) {
    Object.assign(merged.entry, contribution.entry);
    merged.rules.push(...(contribution.rules ?? []));
    merged.plugins.push(...(contribution.plugins ?? []));
    Object.assign(merged.alias, contribution.alias);
    merged.extensions.push(...(contribution.extensions ?? []));
    merged.externals.push(...(contribution.externals ?? []));
    merged.middlewares.push(...(contribution.middlewares ?? []));
  }
  merged.extensions = [...new Set(merged.extensions)];
  merged.externals = [...new Set(merged.externals)];
  return merged;
}
