import { rspack, type Compiler, type DevServer, type Stats } from '@rspack/core';
import { RspackDevServer } from '@rspack/dev-server';
import type { ResolvedOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { createRspackBuild, DIST_PATH, type BuildContext, type ServerMiddleware, type ServerStopper, type StartedServer } from '../rspack/index.js';
import type { ServeSetup } from '../setup/index.js';
import { loadDevCertificate, type HttpsCredentials } from './certificate.js';
import { preflightMiddleware, responseHeaders } from './headers.js';
import { assertPortFree } from './port.js';
import { changedProjectFiles, compileSummary, formatCompileProblems } from './compileReport.js';
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
  const firstCompile = reportCompiles(compiler, root, logger);
  const server = new RspackDevServer(devServerConfiguration(options, credentials, middlewares), compiler);
  const stoppers: ServerStopper[] = [];
  let stopped: Promise<void> | undefined;
  const close = () => (stopped ??= stopDevServer(server, compiler, stoppers));
  try {
    await server.start();
    const startedServer: StartedServer = {
      reloadPages: () => {
        reloadPages(server);
      },
      onStop: (stopper) => {
        stoppers.push(stopper);
      },
    };
    for (const hook of serverStarted) hook(startedServer);
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
      overlay: false,
    },
    devMiddleware: { publicPath: DIST_PATH, stats: 'none' },
    setupMiddlewares: (builtIn) => [...builtIn, ...middlewares, preflightMiddleware()],
  };
}

function reportCompiles(compiler: Compiler, root: string, logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    let first = true;
    compiler.hooks.done.tap('fast-serve:report', (stats) => {
      const changedFiles = first ? [] : changedProjectFiles(root, [...(compiler.modifiedFiles ?? []), ...(compiler.removedFiles ?? [])]);
      logCompile(stats, { verb: first ? 'compiled' : 'rebuilt', root, changedFiles }, logger);
      first = false;
      resolve();
    });
    compiler.hooks.failed.tap('fast-serve:report', (error) => {
      if (first) reject(error);
      else logger.error(error.message);
    });
  });
}

interface CompileReportContext {
  verb: 'compiled' | 'rebuilt';
  root: string;
  changedFiles: readonly string[];
}

function logCompile(stats: Stats, { verb, root, changedFiles }: CompileReportContext, logger: Logger): void {
  const { errors = [], warnings = [], time = 0 } = stats.toJson({ all: false, errors: true, warnings: true, timings: true, moduleTrace: false, errorDetails: false });
  const errorLines = formatCompileProblems('error', errors, root);
  const warningLines = formatCompileProblems('warning', warnings, root);
  for (const error of errorLines) logger.error(error);
  for (const warning of warningLines) logger.warn(warning);
  logger.info(compileSummary({ verb, durationMs: time, changedFiles, errors: errorLines.length, warnings: warningLines.length }));
}

function reloadPages(server: RspackDevServer): void {
  const clients = server.webSocketServer?.clients ?? [];
  if (clients.length > 0) server.sendMessage(clients, 'static-changed');
}

async function stopDevServer(server: RspackDevServer, compiler: Compiler, stoppers: readonly ServerStopper[]): Promise<void> {
  for (const stopper of stoppers) stopper();
  await server.stop();
  await new Promise<void>((resolve) => {
    compiler.close(() => {
      resolve();
    });
  });
}
