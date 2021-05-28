import { ApplySettings } from '../common/types';

export const applyOpenSetting: ApplySettings = (config, settings) => {
  config.devServer.overlay = settings.fullScreenErrors;
}