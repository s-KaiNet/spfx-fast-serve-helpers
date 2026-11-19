import path from 'node:path';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { errorMessage } from '../utils/errors.js';
import { watchSourceFolder } from '../utils/sourceWatcher.js';
import { createAssetTypings } from './assetTypings.js';

export const ASSET_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'cur', 'dds', 'woff', 'woff2', 'eot', 'ttf', 'mp4', 'zip'];

export function assetsContribution({ root, logger }: Pick<BuildContext, 'root' | 'logger'>): ConfigContribution {
  return {
    rules: [
      { test: /\.sprite\.svg$/i, type: 'asset/source' },
      {
        test: new RegExp(`\\.(?:${ASSET_EXTENSIONS.join('|')})(?:[?#].*)?$`, 'i'),
        exclude: /\.sprite\.svg$/i,
        type: 'asset/resource',
        generator: { filename: '[name]_[contenthash][ext]' },
      },
    ],
    serverStarted: [
      (server) => {
        const typings = createAssetTypings({ root, logger });
        void typings.generateAll();
        const watcher = watchSourceFolder(
          path.join(root, 'src'),
          (changes) => {
            for (const { file, exists } of changes) void (exists ? typings.fileAdded(file) : typings.fileRemoved(file));
          },
          (error) => {
            logger.warn(`Static asset typings are not updated on edits: ${errorMessage(error)}`);
          },
        );
        server.onStop(() => {
          watcher.close();
        });
      },
    ],
  };
}
