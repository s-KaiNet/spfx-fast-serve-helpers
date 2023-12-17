import { serveSettings } from '../common/settingsManager';
import { ApplySettings } from '../common/types';
import ESLintWebpackPlugin from 'eslint-webpack-plugin';

export const applyEslintSetting: ApplySettings = (config) => {
  if (serveSettings.eslint) {
    config.plugins.push(new ESLintWebpackPlugin({
      files: './src/**/*.{ts,tsx}',
      lintDirtyModulesOnly: true,
      overrideConfig: {
        ignorePatterns: ['*.js', '*.scss.ts', '*.d.ts'],
        parserOptions: {
          warnOnUnsupportedTypeScriptVersion: false
        }
      }
    }));
  }
}
