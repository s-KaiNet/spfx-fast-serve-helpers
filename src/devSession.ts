import type { ViteDevServer } from 'vite';
import { startDevServer, type StartDevServerOptions } from './devServer.js';
import { createConsoleLogger } from './logger.js';

export interface DevSession {
  close(): Promise<void>;
}

export interface StartDevSessionOptions extends Omit<StartDevServerOptions, 'requestFullRestart'> {
  onRestartFailed: (error: unknown) => void;
  start?: (options: StartDevServerOptions) => Promise<ViteDevServer>;
}

export async function startDevSession({ onRestartFailed, start = startDevServer, logger = createConsoleLogger(), ...options }: StartDevSessionOptions): Promise<DevSession> {
  let server: ViteDevServer | undefined;
  let restarts = Promise.resolve();

  const requestFullRestart = (reason: string) => {
    restarts = restarts
      .then(async () => {
        logger.info(reason);
        const previous = server;
        server = undefined;
        await previous?.close();
        server = await startServer();
      })
      .catch(onRestartFailed);
  };
  const startServer = () => start({ ...options, logger, requestFullRestart });

  server = await startServer();
  return {
    async close() {
      await restarts;
      await server?.close();
    },
  };
}
