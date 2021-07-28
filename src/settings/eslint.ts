import { ApplySettings } from '../common/types';
import ESLintWebpackPlugin from 'eslint-webpack-plugin';

export const applyEslintSetting: ApplySettings = (config, settings) => {
  if (settings.eslint) {
    config.plugins.push(new ESLintWebpackPlugin({
      files: './src/**/*.{ts,tsx}',
      lintDirtyModulesOnly: true
    }));
  }
}
