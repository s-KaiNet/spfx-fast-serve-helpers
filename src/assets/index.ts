import type { ConfigContribution } from '../rspack/contribution.js';

export const ASSET_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'cur', 'dds', 'woff', 'woff2', 'eot', 'ttf', 'mp4', 'zip'];

export function assetsContribution(): ConfigContribution {
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
