import { ClientConfiguration } from 'webpack-dev-server';
import { serveSettings } from '../common/settingsManager';
import { ApplySettings } from '../common/types';

export const applyFullScreenErrors: ApplySettings = (config) => {
  (config.devServer.client as ClientConfiguration).overlay = serveSettings.fullScreenErrors;
}
