import type { ConfigEnv, Plugin, UserConfig } from 'vite';

export type { ConfigEnv, Plugin, UserConfig };

export interface FastServeContext {
  readonly root: string;
  readonly port: number;
  readonly origin: string;
  readonly locale: string;
  readonly serveConfiguration: string | undefined;
  readonly pageUrl: string | undefined;
  readonly spfxVersion: string;
  readonly fastServeVersion: string;
  readonly viteVersion: string;
}

export type FastServeConfigFunction = (context: FastServeContext, env: ConfigEnv) => UserConfig | Promise<UserConfig>;

export type FastServeConfig = UserConfig | Promise<UserConfig> | FastServeConfigFunction;

const CONTEXT_KEY = Symbol.for('spfx-fast-serve-helpers.context');

interface ContextHolder {
  [CONTEXT_KEY]?: FastServeContext;
}

export function publishFastServeContext(context: FastServeContext): void {
  (globalThis as ContextHolder)[CONTEXT_KEY] = Object.freeze({ ...context });
}

export function currentFastServeContext(): FastServeContext {
  const context = (globalThis as ContextHolder)[CONTEXT_KEY];
  if (!context) throw new Error('fast-serve/vite.extend.mts is loaded by the fast-serve command only.');
  return context;
}
