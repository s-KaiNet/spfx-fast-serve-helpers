import webpack from 'webpack';
import { Settings } from '../common/settings';
import { getJSONFile, setDefaultServeSettings } from '../webpack/helpers';
import { applyEslintSetting } from './eslint';
import { applyFullScreenErrors } from './fullScreenErrors';
import { applyhotRefresh } from './hotRefresh';
import { applyLoggingLevel } from './loggingLevel';
import { applyOpenUrlSetting } from './openUrl';

export function applyServeSettings(config: webpack.Configuration) {
  const settings = getJSONFile<Settings>('fast-serve/config.json');
  setDefaultServeSettings(settings);

  applyOpenUrlSetting(config, settings.serve);
  applyFullScreenErrors(config, settings.serve);
  applyLoggingLevel(config, settings.serve);
  applyhotRefresh(config, settings.serve);
  applyEslintSetting(config, settings.serve);
}
