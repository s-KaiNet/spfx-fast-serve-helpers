import webpack from 'webpack';
import { Settings } from '../common/settings';
import { getJSONFile, setDefaultServeSettings } from '../webpack/helpers';
import { applyFullScreenErrors } from './fullScreenErrors';
import { applyhotRefresh } from './hotRefresh';
import { applyLoggingLevel } from './loggingLevel';
import { applyOpenSetting } from './open';
import { applyOpenUrlSetting } from './openUrl';

export function applyServeSettings(config: webpack.Configuration) {
  const settings = getJSONFile<Settings>('fast-serve/config.json');
  setDefaultServeSettings(settings);

  applyOpenSetting(config, settings.serve);
  applyOpenUrlSetting(config, settings.serve);
  applyFullScreenErrors(config, settings.serve);
  applyLoggingLevel(config, settings.serve);
  applyhotRefresh(config, settings.serve);
}