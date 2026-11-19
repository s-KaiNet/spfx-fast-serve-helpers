import type { DevServerMiddlewareHandler, EntryObject, ExternalItem, Plugin, RuleSetRule } from '@rspack/core';

export interface ServerMiddleware {
  name: string;
  middleware: DevServerMiddlewareHandler;
}

export interface PageReloader {
  reloadPages(): void;
}

export type ServerStopper = () => void;

export interface StartedServer extends PageReloader {
  readonly firstCompile: Promise<void>;
  onStop(stopper: ServerStopper): void;
}

export type ServerStartedHook = (server: StartedServer) => void;

export interface ConfigContribution {
  entry?: EntryObject;
  rules?: RuleSetRule[];
  plugins?: Plugin[];
  alias?: Record<string, string>;
  extensions?: string[];
  externals?: ExternalItem[];
  middlewares?: ServerMiddleware[];
  serverStarted?: ServerStartedHook[];
}

export interface MergedContribution {
  entry: EntryObject;
  rules: RuleSetRule[];
  plugins: Plugin[];
  alias: Record<string, string>;
  extensions: string[];
  externals: ExternalItem[];
  middlewares: ServerMiddleware[];
  serverStarted: ServerStartedHook[];
}

export function mergeContributions(contributions: readonly ConfigContribution[]): MergedContribution {
  const merged: MergedContribution = { entry: {}, rules: [], plugins: [], alias: {}, extensions: [], externals: [], middlewares: [], serverStarted: [] };
  for (const contribution of contributions) {
    Object.assign(merged.entry, contribution.entry);
    merged.rules.push(...(contribution.rules ?? []));
    merged.plugins.push(...(contribution.plugins ?? []));
    Object.assign(merged.alias, contribution.alias);
    merged.extensions.push(...(contribution.extensions ?? []));
    merged.externals.push(...(contribution.externals ?? []));
    merged.middlewares.push(...(contribution.middlewares ?? []));
    merged.serverStarted.push(...(contribution.serverStarted ?? []));
  }
  merged.extensions = [...new Set(merged.extensions)];
  merged.externals = [...new Set(merged.externals)];
  return merged;
}
