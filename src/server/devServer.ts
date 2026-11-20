import { rspack, type Compiler, type Configuration, type DevServer, type Stats } from '@rspack/core';
import { RspackDevServer } from '@rspack/dev-server';
import { withPersistentCache } from '../cache/index.js';
import type { ResolvedOptions } from '../config/index.js';
import type { Logger } from '../logger.js';
import { guardExtendConfig, mergeDevServer, mergeRspackConfig, projectRelative, type LoadedExtend } from '../extend/index.js';
import { DIST_PATH, type BuildContext, type ServerMiddleware, type ServerStopper } from '../featureApi/index.js';
import { createRspackBuild, type ServedPageChannel } from '../rspack/index.js';
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
  hashSalt?: string;
  extend?: LoadedExtend;
  persistentCache?: boolean;
}

export interface RunningDevServer {
  readonly origin: string;
  readonly close: () => Promise<void>;
}

export type ReadyBannerKind = 'full' | 'restart';

export interface PreparedDevServer {
  listen(banner?: ReadyBannerKind): Promise<RunningDevServer>;
  dispose(): Promise<void>;
}

export async function startDevServer(options: StartDevServerOptions): Promise<RunningDevServer> {
  await assertPortFree(options.setup.options.port);
  const prepared = await prepareDevServer(options);
  return prepared.listen();
}

export async function prepareDevServer({ setup, logger, https, outputPath, hashSalt, extend, persistentCache = true }: StartDevServerOptions): Promise<PreparedDevServer> {
  const startedAt = performance.now();
  const { root, project, options } = setup;
  const credentials = https ?? (await loadDevCertificate());
  const context: BuildContext = { root, project, options, logger };
  const build = await createRspackBuild(context, { ...(outputPath === undefined ? {} : { outputPath }), ...(hashSalt === undefined ? {} : { hashSalt }) });
  const { config, devServer } = withExtend(build.config, devServerConfiguration(options, credentials, build.middlewares), extend, root, logger);
  const compiler = rspack(!persistentCache || extend?.config.cache !== undefined ? config : withPersistentCache({ root, config, files: [...project.modelFiles(), ...extendFiles(extend)] }));
  let used = false;
  return {
    async listen(banner = 'full') {
      used = true;
      await assertPortFree(options.port);
      return listenDevServer({ compiler, devServer, page: build.page, setup, logger, startedAt, banner });
    },
    async dispose() {
      if (!used) await closeCompiler(compiler);
    },
  };
}

function extendFiles(extend: LoadedExtend | undefined): string[] {
  return extend === undefined ? [] : [extend.file, ...extend.dependencies];
}

function withExtend(config: Configuration, devServer: DevServer, extend: LoadedExtend | undefined, root: string, logger: Logger): { config: Configuration; devServer: DevServer } {
  if (extend === undefined) return { config, devServer };
  const guarded = guardExtendConfig(extend.config);
  const file = projectRelative(root, extend.file);
  for (const { key, alternative } of guarded.ignored) logger.warn(`${file}: "${key}" is ignored (${alternative})`);
  for (const note of guarded.notes) logger.warn(`${file}: ${note}`);
  return { config: mergeRspackConfig(config, guarded.config), devServer: mergeDevServer(devServer, guarded.devServer) };
}

interface ListenOptions {
  compiler: Compiler;
  devServer: DevServer;
  page: ServedPageChannel;
  setup: Pick<ServeSetup, 'root' | 'project' | 'options'>;
  logger: Logger;
  startedAt: number;
  banner: ReadyBannerKind;
}

async function listenDevServer({ compiler, devServer, page, setup, logger, startedAt, banner }: ListenOptions): Promise<RunningDevServer> {
  const { root, project, options } = setup;
  const firstCompile = reportCompiles(compiler, root, project.codeRoots().map((codeRoot) => codeRoot.root), logger);
  const server = new RspackDevServer(devServer, compiler);
  const stoppers: ServerStopper[] = [];
  let stopped: Promise<void> | undefined;
  const close = () => (stopped ??= stopDevServer(server, compiler, stoppers));
  try {
    await server.start();
    page.serverStarted({
      firstCompile: firstCompile.then(
        () => undefined,
        () => undefined,
      ),
      reloadPages: () => {
        reloadPages(server);
      },
      onStop: (stopper) => {
        stoppers.push(stopper);
      },
    });
    await firstCompile;
  } catch (error) {
    await close();
    throw error;
  }
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (banner === 'restart') logger.info(`restarted in ${elapsedMs} ms at ${options.origin}`);
  else for (const line of readyBanner(options, project.components(), elapsedMs)) logger.info(line);
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

function reportCompiles(compiler: Compiler, root: string, codeRoots: readonly string[], logger: Logger): Promise<void> {
  return new Promise((resolve, reject) => {
    let first = true;
    compiler.hooks.done.tap('fast-serve:report', (stats) => {
      const changedFiles = first ? [] : changedProjectFiles(root, [...(compiler.modifiedFiles ?? []), ...(compiler.removedFiles ?? [])], codeRoots);
      logCompile(stats, { verb: first ? 'compiled' : 'rebuilt', root, codeRoots, changedFiles }, logger);
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
  codeRoots: readonly string[];
  changedFiles: readonly string[];
}

function logCompile(stats: Stats, { verb, root, codeRoots, changedFiles }: CompileReportContext, logger: Logger): void {
  const { errors = [], warnings = [], time = 0 } = stats.toJson({ all: false, errors: true, warnings: true, timings: true, moduleTrace: false, errorDetails: false });
  const errorLines = formatCompileProblems('error', errors, root, codeRoots);
  const warningLines = formatCompileProblems('warning', warnings, root, codeRoots);
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
  await closeCompiler(compiler);
}

function closeCompiler(compiler: Compiler): Promise<void> {
  return new Promise<void>((resolve) => {
    compiler.close(() => {
      resolve();
    });
  });
}
