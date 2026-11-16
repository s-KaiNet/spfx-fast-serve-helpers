import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot, type Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { toPosix } from '../utils/paths.js';
import type { HttpsCredentials } from './certificate.js';

export { loadDevCertificate } from './certificate.js';
export { debugPageUrl, debugQuery } from './debugUrl.js';
export { createViteLogger } from './viteLogger.js';

const SPFX_BUILD_OUTPUT_FOLDERS = ['lib', 'lib-commonjs', 'lib-esm', 'lib-dts', 'dist', 'temp', 'release', 'sharepoint', 'teams', 'jest-output', '.heft'];

const FAST_SERVE_PACKAGE_ROOT = fileURLToPath(new URL('../..', import.meta.url));

export function serverPlugin(context: ServeContext, https: HttpsCredentials): Plugin {
  const { root, options, project, logger } = context;
  const rootGlob = toPosix(root);

  return {
    name: 'fast-serve:server',
    config: () => ({
      appType: 'custom',
      clearScreen: false,
      server: {
        host: 'localhost',
        port: options.port,
        strictPort: true,

        origin: options.origin,
        https,
        cors: { origin: true },

        headers: { 'Access-Control-Allow-Private-Network': 'true' },
        watch: { ignored: SPFX_BUILD_OUTPUT_FOLDERS.map((folder) => `${rootGlob}/${folder}/**`) },
        warmup: {
          clientFiles: ['./src/**/*.{ts,tsx,js,jsx}', '!./src/**/*.d.ts', '!./src/**/*.{test,spec}.*', '!./src/**/__tests__/**'],
        },
        fs: { allow: [searchForWorkspaceRoot(root), FAST_SERVE_PACKAGE_ROOT] },

        forwardConsole: { unhandledErrors: true, logLevels: ['error'] },
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
    }),

    configureServer(server) {
      const onFileEvent = (file: string) => {
        if (!project.invalidate(file)) return;
        logger.info(`${toPosix(path.relative(root, file))} changed, reloading the page`);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(project.modelFiles());
      server.watcher.on('change', onFileEvent);
      server.watcher.on('add', onFileEvent);
      server.watcher.on('unlink', onFileEvent);
    },
  };
}
