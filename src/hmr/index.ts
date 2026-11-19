import path from 'node:path';
import { rspack } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';
import { packageFile } from '../utils/packageFile.js';
import { SharedHotUpdateGlobalPlugin } from './sharedHotUpdateGlobal.js';

export { SharedHotUpdateGlobalPlugin } from './sharedHotUpdateGlobal.js';

export function hmrContribution({ root }: BuildContext): ConfigContribution {
  const refreshEntry = packageFile('./runtime/refreshEntry', import.meta.url);
  return {
    plugins: [
      new ReactRefreshRspackPlugin({ include: path.join(root, 'src'), injectEntry: false }),
      new rspack.EntryPlugin(root, refreshEntry, { name: undefined }),
      new SharedHotUpdateGlobalPlugin(),
    ],
  };
}
