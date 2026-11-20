import type { EntryObject, ExternalItem, Plugin, RuleSetRule } from '@rspack/core';
import type { ConfigContribution, ServerMiddleware } from '../featureApi/index.js';

export interface MergedContribution {
  entry: EntryObject;
  rules: RuleSetRule[];
  plugins: Plugin[];
  alias: Record<string, string>;
  extensions: string[];
  externals: ExternalItem[];
  middlewares: ServerMiddleware[];
}

export function mergeContributions(contributions: readonly ConfigContribution[]): MergedContribution {
  return {
    entry: laterFeatureWins(contributions.map((contribution) => contribution.entry)),
    rules: inFeatureOrder(contributions.map((contribution) => contribution.rules)),
    plugins: inFeatureOrder(contributions.map((contribution) => contribution.plugins)),
    alias: laterFeatureWins(contributions.map((contribution) => contribution.alias)),
    extensions: firstOccurrenceInFeatureOrder(contributions.map((contribution) => contribution.extensions)),
    externals: firstOccurrenceInFeatureOrder(contributions.map((contribution) => contribution.externals)),
    middlewares: inFeatureOrder(contributions.map((contribution) => contribution.middlewares)),
  };
}

function inFeatureOrder<T>(lists: readonly (readonly T[] | undefined)[]): T[] {
  return lists.flatMap((list) => list ?? []);
}

function firstOccurrenceInFeatureOrder<T>(lists: readonly (readonly T[] | undefined)[]): T[] {
  return [...new Set(inFeatureOrder(lists))];
}

function laterFeatureWins<T extends object>(records: readonly (T | undefined)[]): T {
  return Object.assign({}, ...records) as T;
}
