import webpack from 'webpack';
import { applyContainersSetting } from './containers';
import { applyEslintSetting } from './eslint';
import { applyFullScreenErrors } from './fullScreenErrors';
import { applyhotRefresh } from './hotRefresh';
import { applyLoggingLevel } from './loggingLevel';
import { applyOpenUrlSetting } from './openUrl';
import { applyReactProfilingSetting } from './reactProfiling';

export function applyServeSettings(config: webpack.Configuration) {

  applyOpenUrlSetting(config);
  applyFullScreenErrors(config);
  applyLoggingLevel(config);
  applyhotRefresh(config);
  applyEslintSetting(config);
  applyReactProfilingSetting(config);
  applyContainersSetting(config);
}
