import { statSync } from 'node:fs';
import path from 'node:path';
import { loadConfigFromFile, type Plugin, type ViteDevServer } from 'vite';
import type { ServeContext } from '../context.js';
import { errorMessage } from '../utils/errors.js';
import { findViteExtendFile, isViteExtendCandidate, projectRelative } from './files.js';

export type FullRestart = (reason: string) => void;

const VALIDATION_ENV = { command: 'serve', mode: 'development', isSsrBuild: false, isPreview: false } as const;

function fileVersion(file: string): string {
  const { mtimeMs, size } = statSync(file, { throwIfNoEntry: false }) ?? { mtimeMs: 0, size: 0 };
  return `${file}:${mtimeMs}:${size}`;
}

function detachFromViteRestart(server: ViteDevServer, deletedFile: string): void {
  const config = server.config as { configFile: string | undefined; configFileDependencies: string[] };
  config.configFile = undefined;
  config.configFileDependencies = config.configFileDependencies.filter((file) => path.resolve(file) !== path.resolve(deletedFile));
}

export function viteExtendWatchPlugin({ root, logger }: ServeContext, loadedFile: string | undefined, requestFullRestart: FullRestart): Plugin {
  let server: ViteDevServer | undefined;
  let checks = Promise.resolve();
  let checkQueued = false;
  let restartRequested = false;
  let failedVersion: string | undefined;

  const isLoadedFile = (file: string) => loadedFile !== undefined && path.resolve(file) === path.resolve(loadedFile);

  const switchFileIfNeeded = async () => {
    const nextFile = findViteExtendFile(root);
    if (nextFile === loadedFile || restartRequested) return;
    if (nextFile !== undefined && fileVersion(nextFile) === failedVersion) return;
    const loadError = nextFile === undefined ? undefined : await loadErrorOf(nextFile);
    if (nextFile !== undefined && loadError !== undefined) {
      failedVersion = fileVersion(nextFile);
      logger.error(`${projectRelative(root, nextFile)} could not be loaded: ${loadError}\nThe server keeps running without it; fast-serve restarts when the file is fixed.`);
      return;
    }
    restartRequested = true;
    requestFullRestart(nextFile === undefined ? `${projectRelative(root, loadedFile ?? root)} was removed, restarting fast-serve` : `${projectRelative(root, nextFile)} found, restarting fast-serve`);
  };

  const loadErrorOf = async (file: string): Promise<string | undefined> => {
    try {
      await loadConfigFromFile(VALIDATION_ENV, file, root, 'silent', undefined, 'bundle');
      return undefined;
    } catch (error) {
      return errorMessage(error);
    }
  };

  const onFileEvent = (file: string) => {
    if (!isViteExtendCandidate(root, file) || checkQueued) return;
    checkQueued = true;
    checks = checks.then(() => {
      checkQueued = false;
      return switchFileIfNeeded();
    });
  };

  return {
    name: 'fast-serve:vite-extend-watch',
    configureServer(devServer) {
      server = devServer;
      devServer.watcher.on('add', onFileEvent);
      devServer.watcher.on('unlink', onFileEvent);
      devServer.watcher.on('change', onFileEvent);
    },
    watchChange(file, { event }) {
      if (event === 'delete' && isLoadedFile(file) && server) detachFromViteRestart(server, file);
    },
  };
}
