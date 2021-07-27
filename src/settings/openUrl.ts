import { ApplySettings } from '../common/types';

export const applyOpenUrlSetting: ApplySettings = (config, settings) => {
  if (!settings.openUrl) {
    config.devServer.open = false;
  } else {
    config.devServer.open = true;
    config.devServer.openPage = settings.openUrl;
  }
}
