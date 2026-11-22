import type { DevServerMiddlewareHandler, EntryObject, ExternalItem, Plugin, RuleSetRule } from '@rspack/core';
import type { FeatureContext } from './context.js';

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
  externals?: ExternalItem[];
  middlewares?: ServerMiddleware[];
}

export interface Feature {
  readonly name: string;
  contribute(context: FeatureContext): ConfigContribution | Promise<ConfigContribution>;
}
