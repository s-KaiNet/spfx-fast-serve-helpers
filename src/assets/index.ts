import type { Plugin } from 'vite';
import type { ServeContext } from '../context.js';
import { createAssetTypings } from './assetTypings.js';

export function assetTypingsPlugin({ root, logger }: ServeContext): Plugin {
  return {
    name: 'fast-serve:asset-typings',
    configureServer(server) {
      const typings = createAssetTypings({ root, logger });
      server.httpServer?.once('listening', () => {
        void typings.generateAll();
      });
      server.watcher.on('add', (file) => void typings.fileAdded(file));
      server.watcher.on('unlink', (file) => void typings.fileRemoved(file));
    },
  };
}
