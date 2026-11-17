import type { Plugin } from 'vite';
import type { ServeContext } from '../../context.js';
import { createScssTypings } from './scssTypings.js';

export function scssTypingsPlugin({ root, logger }: ServeContext, { after }: { after: Promise<void> }): Plugin {
  return {
    name: 'fast-serve:scss-typings',
    configureServer(server) {
      const typings = createScssTypings({ root, logger });
      void after.then(() => typings.generateAll());
      server.watcher.on('add', (file) => void typings.fileChanged(file));
      server.watcher.on('change', (file) => void typings.fileChanged(file));
      server.watcher.on('unlink', (file) => void typings.fileRemoved(file));
    },
  };
}
