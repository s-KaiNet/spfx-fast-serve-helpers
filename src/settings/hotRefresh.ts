// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactRefreshPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
import ReactRefreshTypeScript from 'react-refresh-typescript';
import webpack from 'webpack';

import { ApplySettings } from '../common/types';

export const applyhotRefresh: ApplySettings = (config, settings) => {
  if (!settings.hotRefresh) {
    return;
  }

  const tsLoaderRule = config.module.rules[0];

  for (const useRule of (tsLoaderRule.use as webpack.RuleSetUseItem[])) {
    if ((useRule as webpack.RuleSetLoader).loader.indexOf('ts-loader') !== -1) {
      ((useRule as webpack.RuleSetLoader).options as any).getCustomTransformers = () => ({
        before: [ReactRefreshTypeScript()],
      })
    }
  }

  config.plugins.push(new ReactRefreshPlugin());
  config.devServer.hot = true;

  let indx = (config.externals as string[]).indexOf('react');
  (config.externals as string[]).splice(indx, 1);
  indx = (config.externals as string[]).indexOf('react-dom');
  (config.externals as string[]).splice(indx, 1);
}