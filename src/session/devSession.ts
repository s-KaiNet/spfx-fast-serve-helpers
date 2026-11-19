import type { FastServeOptions } from '../config/options.js';
import { ExtendLoadError, fastServeContext, findExtendFiles, loadExtendFile, projectRelative, webpackCustomizationHint, type LoadedExtend } from '../extend/index.js';
import type { Logger } from '../logger.js';
import { prepareDevServer, type PreparedDevServer, type RunningDevServer } from '../server/devServer.js';
import type { HttpsCredentials } from '../server/certificate.js';
import { assertPortFree } from '../server/port.js';
import { describeSetup, prepareServe, type ServeSetup } from '../setup/index.js';
import { errorMessage } from '../utils/errors.js';
import { watchFiles, type FileChange, type FileWatcher } from './fileWatcher.js';
import { restartReason, restartTriggers, type RestartTriggers } from './restartTriggers.js';

export interface StartDevSessionOptions {
  root: string;
  cli?: FastServeOptions;
  logger: Logger;
  onRestartFailed: (error: unknown) => void;
  env?: NodeJS.ProcessEnv;
  https?: HttpsCredentials;
  outputPath?: string;
  settleMs?: number;
}

export interface DevSession {
  readonly origin: string;
  readonly restarts: number;
  idle(): Promise<void>;
  close(): Promise<void>;
}

interface Generation {
  setup: ServeSetup;
  extend: LoadedExtend | undefined;
  prepared: PreparedDevServer;
}

interface Running {
  server: RunningDevServer;
  watcher: FileWatcher;
  setup: ServeSetup;
}

const KEEPS_RUNNING = 'The server keeps running with the previous configuration; fast-serve restarts when the file is fixed.';

export async function startDevSession(options: StartDevSessionOptions): Promise<DevSession> {
  const { root, cli = {}, logger, onRestartFailed, env, https, outputPath, settleMs } = options;
  let running: Running | undefined;
  let queue = Promise.resolve();
  let restartQueued = false;
  let restarts = 0;
  let closed = false;

  const prepareGeneration = async (initial: boolean): Promise<Generation> => {
    const setup = prepareServe({ root, cli, logger, ...(env === undefined ? {} : { env }) });
    if (initial) {
      for (const line of describeSetup(setup)) logger.info(line);
      await assertPortFree(setup.options.port);
    }
    const extend = await loadExtend(setup, initial);
    const prepared = await prepareDevServer({
      setup,
      logger,
      hashSalt: String(Date.now()),
      ...(https === undefined ? {} : { https }),
      ...(outputPath === undefined ? {} : { outputPath }),
      ...(extend === undefined ? {} : { extend }),
    });
    return { setup, extend, prepared };
  };

  const loadExtend = async (setup: ServeSetup, initial: boolean): Promise<LoadedExtend | undefined> => {
    const [file, ...others] = findExtendFiles(setup.root);
    if (file === undefined) {
      if (initial) for (const line of webpackCustomizationHint(setup.root)) logger.info(line);
      return undefined;
    }
    const relative = projectRelative(setup.root, file);
    if (others.length > 0) logger.warn(`several Rspack extend files found, using ${relative} (ignored: ${others.map((other) => projectRelative(setup.root, other)).join(', ')})`);
    const extend = await loadExtendFile(file, fastServeContext(setup.root, setup.options, setup.spfxVersion));
    logger.info(`Rspack config: ${relative}`);
    return extend;
  };

  const watch = (generation: Generation): FileWatcher => {
    let triggers: RestartTriggers = restartTriggers(generation.setup.project, generation.extend?.file, generation.extend?.dependencies ?? []);
    const watcher = watchFiles(triggers.files, {
      onChange: (changes: FileChange[]) => {
        requestRestart(restartReason(triggers, changes));
      },
      onError: (error) => {
        logger.warn(`project files are not watched for restarts anymore: ${errorMessage(error)}`);
      },
      ...(settleMs === undefined ? {} : { settleMs }),
    });
    return {
      add(files) {
        triggers = restartTriggers(generation.setup.project, generation.extend?.file, [...(generation.extend?.dependencies ?? []), ...files]);
        watcher.add(files);
      },
      close: () => {
        watcher.close();
      },
    };
  };

  const restart = async () => {
    let next: Generation;
    try {
      next = await prepareGeneration(false);
    } catch (error) {
      reportFailedRestart(error);
      return;
    }
    if (closed || !running) {
      await next.prepared.dispose();
      return;
    }
    const banner = sameDebugUrl(running.setup, next.setup) ? 'restart' : 'full';
    running.watcher.close();
    await running.server.close();
    running = undefined;
    try {
      running = { server: await next.prepared.listen(banner), watcher: watch(next), setup: next.setup };
      restarts += 1;
    } catch (error) {
      onRestartFailed(error);
    }
  };

  const reportFailedRestart = (error: unknown) => {
    if (error instanceof ExtendLoadError) {
      logger.error(`${projectRelative(root, error.file)} could not be loaded:\n${error.message}\n${KEEPS_RUNNING}`);
      running?.watcher.add(error.dependencies);
      return;
    }
    logger.error(`restart failed: ${errorMessage(error)}\n${KEEPS_RUNNING}`);
  };

  const requestRestart = (reason: string) => {
    if (restartQueued || closed) return;
    restartQueued = true;
    queue = queue.then(async () => {
      restartQueued = false;
      if (closed) return;
      logger.info(reason);
      await restart();
    });
  };

  let first: Generation;
  try {
    first = await prepareGeneration(true);
  } catch (error) {
    if (error instanceof ExtendLoadError) {
      throw new Error(`${projectRelative(root, error.file)} could not be loaded:\n${error.message}\nFix or remove the file and run fast-serve again.`, { cause: error });
    }
    throw error;
  }
  running = { server: await first.prepared.listen(), watcher: watch(first), setup: first.setup };

  return {
    get origin() {
      return running?.server.origin ?? first.setup.options.origin;
    },
    get restarts() {
      return restarts;
    },
    idle: () => queue,
    async close() {
      closed = true;
      await queue;
      running?.watcher.close();
      await running?.server.close();
      running = undefined;
    },
  };
}

function debugUrlInputs({ options, project }: ServeSetup): string {
  return JSON.stringify([options.origin, options.pageUrl, options.serveConfiguration, project.components().map(({ manifest }) => manifest.id)]);
}

function sameDebugUrl(previous: ServeSetup, next: ServeSetup): boolean {
  return debugUrlInputs(previous) === debugUrlInputs(next);
}
