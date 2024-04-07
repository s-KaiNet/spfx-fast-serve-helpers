// eslint-disable-next-line @typescript-eslint/no-var-requires
const ReactRefreshPlugin = require('@pmmmwh/react-refresh-webpack-plugin');
import ReactRefreshTypeScript from 'react-refresh-typescript';
import webpack, { RuleSetRule } from 'webpack';

import { ApplySettings, RuleItem } from '../common/types';
import { serveSettings } from '../common/settingsManager';

// TODO the whole hot refresh feature is not working as expected, needs to be verified separately

export const applyhotRefresh: ApplySettings = (config) => {
  if (!serveSettings.hotRefresh) {
    return;
  }

  const tsLoaderRule = getTsRule(config.module.rules);

  for (const useRule of (tsLoaderRule.use as webpack.RuleSetUseItem[])) {
    if ((useRule as RuleItem).loader.indexOf('ts-loader') !== -1) {
      ((useRule as RuleItem).options as any).getCustomTransformers = () => ({
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

function getTsRule(rules: webpack.Configuration['module']['rules']) {
  for (const rule of rules as RuleSetRule[]) {
    if (rule.test) {
      const test = rule.test.toString();
      if (test.indexOf('.tsx?') !== -1) {
        return rule;
      }
    }
  }

  throw new Error('Unable to resolve ts-loader rule');
}
