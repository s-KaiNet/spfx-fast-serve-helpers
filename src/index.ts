import { currentFastServeContext, type ConfigEnv, type FastServeConfigFunction, type UserConfig } from './viteExtend/context.js';

export type { ConfigEnv, FastServeConfig, FastServeConfigFunction, FastServeContext, Plugin, UserConfig } from './viteExtend/context.js';

export function defineConfig(config: UserConfig): UserConfig;
export function defineConfig(config: Promise<UserConfig>): Promise<UserConfig>;
export function defineConfig(config: FastServeConfigFunction): (env: ConfigEnv) => UserConfig | Promise<UserConfig>;
export function defineConfig(
  config: UserConfig | Promise<UserConfig> | FastServeConfigFunction,
): UserConfig | Promise<UserConfig> | ((env: ConfigEnv) => UserConfig | Promise<UserConfig>) {
  if (typeof config !== 'function') return config;
  return (env: ConfigEnv) => config(currentFastServeContext(), env);
}
