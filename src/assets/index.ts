import path from 'node:path';
import type { ConfigContribution, Feature, FeatureContext } from '../bundler/featureApi/index.js';
import { errorMessage } from '../shared/errors.js';
import { watchSourceFolder } from '../shared/sourceWatcher.js';
import { createAssetTypings } from './assetTypings.js';

export const ASSET_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'cur', 'dds', 'woff', 'woff2', 'eot', 'ttf', 'mp4', 'zip'];

export const assetsFeature: Feature = { name: 'assets', contribute: assetsContribution };

function assetsContribution({ root, logger, page }: Pick<FeatureContext, 'root' | 'logger' | 'page'>): ConfigContribution {
  page.onServerStarted((server) => {
    const typings = createAssetTypings({
      root,
      logger,
      onTypingsUpdated: (update) => {
        page.typingsUpdated(update);
      },
    });
    void server.firstCompile.then(() => typings.generateAll());
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
  });
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
  };
}
