import { ClientConfiguration } from 'webpack-dev-server';
import { serveSettings } from '../common/settingsManager';
import { ApplySettings } from '../common/types';

export const applyFullScreenErrors: ApplySettings = (config) => {
  let client = config.devServer.client as ClientConfiguration;
  client = client || {};

  client.overlay = serveSettings.fullScreenErrors;
}
