import type { Configuration } from '@rspack/core';

export interface FastServeContext {
  readonly root: string;
  readonly port: number;
  readonly origin: string;
  readonly publicPath: string;
  readonly locale: string;
  readonly serveConfiguration: string | undefined;
  readonly pageUrl: string | undefined;
  readonly spfxVersion: string;
  readonly fastServeVersion: string;
  readonly rspackVersion: string;
}

export interface FastServeEnv {
  readonly command: 'serve';
  readonly mode: 'development';
}

export type FastServeConfigFunction = (context: FastServeContext, env: FastServeEnv) => Configuration | Promise<Configuration>;

export type FastServeConfig = Configuration | Promise<Configuration> | FastServeConfigFunction;

export const FAST_SERVE_ENV: FastServeEnv = Object.freeze({ command: 'serve', mode: 'development' });
