import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { searchForWorkspaceRoot, type Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { tsconfigTransformChanged } from '../transforms/tsconfig/index.js';
import { errorMessage } from '../utils/errors.js';
import { toPosix } from '../utils/paths.js';
import type { HttpsCredentials } from './certificate.js';

export { loadDevCertificate } from './certificate.js';
export { debugPageUrl, debugQuery } from './debugUrl.js';
export { serveConfigurationWarnings } from './serveConfigurationWarnings.js';
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
      base: '/',
      clearScreen: false,
      experimental: { bundledDev: false },
      server: {
        host: 'localhost',
        port: options.port,
        strictPort: true,

        origin: options.origin,
        https,
        cors: { origin: true },

        headers: { 'Access-Control-Allow-Private-Network': 'true' },
        watch: { ignored: SPFX_BUILD_OUTPUT_FOLDERS.map((folder) => `${rootGlob}/${folder}/**`) },
        fs: { allow: [searchForWorkspaceRoot(root), FAST_SERVE_PACKAGE_ROOT] },
      },
      resolve: {
        dedupe: ['react', 'react-dom'],
      },
    }),

    configureServer(server) {
      const restart = (reason: string) => {
        logger.info(reason);
        server.restart().catch((error: unknown) => {
          logger.error(`restart failed: ${errorMessage(error)}`);
        });
      };
      const onFileEvent = (file: string) => {
        const change = project.invalidate(file);
        if (!change) return;
        const changedFile = toPosix(path.relative(root, file));
        if (change === 'sass') {
          restart(`${changedFile} changed, restarting the dev server`);
          return;
        }
        if (change === 'tsconfig' && tsconfigTransformChanged(server, project)) {
          restart(`${changedFile} changed the TypeScript transform options, restarting the dev server`);
          return;
        }
        logger.info(`${changedFile} changed, reloading the page`);
        if (change === 'tsconfig') {
          for (const environment of Object.values(server.environments)) environment.moduleGraph.invalidateAll();
        }
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(project.modelFiles());
      server.watcher.on('change', onFileEvent);
      server.watcher.on('add', onFileEvent);
      server.watcher.on('unlink', onFileEvent);
    },
  };
}
