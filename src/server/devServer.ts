import { rspack, type Compiler, type DevServer, type Stats } from '@rspack/core';
import { RspackDevServer } from '@rspack/dev-server';
import type { ResolvedOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { createRspackBuild, DIST_PATH, type BuildContext, type ServerMiddleware } from '../rspack/index.js';
import type { ServeSetup } from '../setup/index.js';
import { loadDevCertificate, type HttpsCredentials } from './certificate.js';
import { preflightMiddleware, responseHeaders } from './headers.js';
import { assertPortFree } from './port.js';
import { readyBanner } from './readyBanner.js';

export interface StartDevServerOptions {
  setup: Pick<ServeSetup, 'root' | 'project' | 'options'>;
  logger: Logger;
  https?: HttpsCredentials;
  outputPath?: string;
}

export interface RunningDevServer {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

export async function startDevServer({ setup, logger, https, outputPath }: StartDevServerOptions): Promise<RunningDevServer> {
  const startedAt = performance.now();
  const { root, project, options } = setup;
  await assertPortFree(options.port);
  const credentials = https ?? (await loadDevCertificate());
  const context: BuildContext = { root, project, options, logger };
  const { config, middlewares, serverStarted } = await createRspackBuild(context, outputPath === undefined ? {} : { outputPath });
  const compiler = rspack(config);
  const firstCompile = reportCompiles(compiler, logger);
  const server = new RspackDevServer(devServerConfiguration(options, credentials, middlewares), compiler);
  let stopped: Promise<void> | undefined;
  const close = () => (stopped ??= stopDevServer(server, compiler));
  try {
    await server.start();
    const reloader = {
      reloadPages: () => {
        reloadPages(server);
      },
    };
    for (const hook of serverStarted) hook(reloader);
    await firstCompile;
  } catch (error) {
    await close();
    throw error;
  }
  for (const line of readyBanner(options, project.components(), Math.round(performance.now() - startedAt))) logger.info(line);
  return { origin: options.origin, close };
}

export function devServerConfiguration(options: ResolvedOptions, https: HttpsCredentials, middlewares: readonly ServerMiddleware[]): DevServer {
  return {
    host: 'localhost',
    port: options.port,
    hot: true,
    liveReload: true,
    allowedHosts: 'all',
    compress: false,
    static: false,
    historyApiFallback: false,
    setupExitSignals: false,
    server: { type: 'https', options: { cert: https.cert, key: https.key } },
    headers: (req) => responseHeaders(req.url),
    client: {
      webSocketURL: { protocol: 'wss', hostname: 'localhost', port: options.port },
      logging: 'warn',
      overlay: options.overlay ? { errors: true, warnings: false, runtimeErrors: false } : false,
    },
    devMiddleware: { publicPath: DIST_PATH, stats: 'none' },
    setupMiddlewares: (builtIn) => [...builtIn, ...middlewares, preflightMiddleware()],
  };
}

function reportCompiles(compiler: Compiler, logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    let first = true;
    compiler.hooks.done.tap('fast-serve:report', (stats) => {
      logCompile(stats, first ? 'compiled' : 'rebuilt', logger);
      first = false;
      resolve();
    });
    compiler.hooks.failed.tap('fast-serve:report', (error) => {
      if (first) reject(error);
      else logger.error(error.message);
    });
  });
}

function logCompile(stats: Stats, verb: string, logger: Logger): void {
  const { errors = [], warnings = [], time = 0 } = stats.toJson({ all: false, errors: true, warnings: true, timings: true });
  for (const error of errors) logger.error(error.message);
  for (const warning of warnings) logger.warn(warning.message);
  logger.info(`${verb} in ${time} ms: ${errors.length} errors, ${warnings.length} warnings`);
}

function reloadPages(server: RspackDevServer): void {
  const clients = server.webSocketServer?.clients ?? [];
  if (clients.length > 0) server.sendMessage(clients, 'static-changed');
}

async function stopDevServer(server: RspackDevServer, compiler: Compiler): Promise<void> {
  await server.stop();
  await new Promise<void>((resolve) => {
    compiler.close(() => {
      resolve();
    });
  });
}
