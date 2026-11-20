import { rspack } from '@rspack/core';
import { ReactRefreshRspackPlugin } from '@rspack/plugin-react-refresh';
import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { packageFile } from '../utils/packageFile.js';
import { SharedHotUpdateGlobalPlugin } from './sharedHotUpdateGlobal.js';

export { SharedHotUpdateGlobalPlugin } from './sharedHotUpdateGlobal.js';

export const hmrFeature: Feature = { name: 'hmr', contribute: hmrContribution };

function hmrContribution({ root, project }: FeatureContext): ConfigContribution {
  const sourceFolders = project.codeRoots().map((codeRoot) => codeRoot.sourceDir);
  const refreshEntry = packageFile('./runtime/refreshEntry', import.meta.url);
  return {
    plugins: [
      new ReactRefreshRspackPlugin({ include: sourceFolders, injectEntry: false }),
      new rspack.EntryPlugin(root, refreshEntry, { name: undefined }),
      new SharedHotUpdateGlobalPlugin(),
    ],
  };
}
