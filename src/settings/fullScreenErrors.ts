import { ClientConfiguration } from 'webpack-dev-server';
import { serveSettings } from '../common/settingsManager';
import { ApplySettings } from '../common/types';

export const applyFullScreenErrors: ApplySettings = (config) => {
  config.devServer.client = config.devServer.client || {};
  const client = config.devServer.client as ClientConfiguration;

  client.overlay = {
    errors: serveSettings.fullScreenErrors,
    warnings: false,
    runtimeErrors: false
  };
}
