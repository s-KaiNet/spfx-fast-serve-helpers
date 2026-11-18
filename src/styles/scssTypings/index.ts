import type { Plugin } from 'vite';
import type { ServeContext } from '../../context.js';
import { createScssTypings } from './scssTypings.js';

export function scssTypingsPlugin({ root, logger, project }: ServeContext): Plugin {
  return {
    name: 'fast-serve:scss-typings',
    configureServer(server) {
      const typings = createScssTypings({ root, logger, sassConfiguration: () => project.sassConfiguration() });
      const generateAll = () => void typings.generateAll();
      if (server.httpServer) server.httpServer.once('listening', generateAll);
      else generateAll();
      server.watcher.on('add', (file) => void typings.fileChanged(file));
      server.watcher.on('change', (file) => void typings.fileChanged(file));
      server.watcher.on('unlink', (file) => void typings.fileRemoved(file));
    },
  };
}
