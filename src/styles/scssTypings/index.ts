import type { FeatureContext, ServerStartedHook } from '../../featureApi/index.js';
import { errorMessage } from '../../utils/errors.js';
import { watchSourceFolder } from '../../utils/sourceWatcher.js';
import { createScssTypings } from './scssTypings.js';

export { createScssTypings, type ScssTypings } from './scssTypings.js';

export function scssTypingsOnServerStart({ root, logger, project, page }: FeatureContext, sourceFolder: string): ServerStartedHook {
  return (server) => {
    const typings = createScssTypings({
      root,
      logger,
      sassConfiguration: () => project.sassConfiguration(),
      onTypingsUpdated: (update) => {
        page.typingsUpdated(update);
      },
    });
    void server.firstCompile.then(() => typings.generateAll());
    const watcher = watchSourceFolder(
      sourceFolder,
      (changes) => {
        for (const { file, exists } of changes) void (exists ? typings.fileChanged(file) : typings.fileRemoved(file));
      },
      (error) => {
        logger.warn(`SCSS typings are not updated on edits: ${errorMessage(error)}`);
      },
    );
    server.onStop(() => {
      watcher.close();
    });
  };
}
