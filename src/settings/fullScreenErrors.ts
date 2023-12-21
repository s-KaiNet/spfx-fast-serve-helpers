import { serveSettings } from '../common/settingsManager';
import { ApplySettings } from '../common/types';

export const applyFullScreenErrors: ApplySettings = (config) => {
  config.devServer.overlay = serveSettings.fullScreenErrors;
}
