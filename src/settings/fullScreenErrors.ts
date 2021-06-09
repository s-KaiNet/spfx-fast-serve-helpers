import { ApplySettings } from '../common/types';

export const applyFullScreenErrors: ApplySettings = (config, settings) => {
  config.devServer.open = settings.open;
}
