import type { Configuration } from '@rspack/core';
import type { FastServeConfigFunction } from './extend/context.js';

export { rspack } from '@rspack/core';
export type { Compiler, Configuration, DevServer, ExternalItem, Plugin, ResolveAlias, RspackPluginInstance, RuleSetRule } from '@rspack/core';
export type { FastServeConfig, FastServeConfigFunction, FastServeContext, FastServeEnv } from './extend/context.js';

export function defineConfig(config: Configuration): Configuration;
export function defineConfig(config: Promise<Configuration>): Promise<Configuration>;
export function defineConfig(config: FastServeConfigFunction): FastServeConfigFunction;
export function defineConfig(config: Configuration | Promise<Configuration> | FastServeConfigFunction): Configuration | Promise<Configuration> | FastServeConfigFunction {
  return config;
}
