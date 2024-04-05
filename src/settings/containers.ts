import { ApplySettings, ServeConfigurations } from '../common/types';
import { getJSONFile } from '../common/helpers';
import { serveSettings } from '../common/settingsManager';
import { ClientConfiguration, Static, WebSocketURL } from 'webpack-dev-server';

export const applyContainersSetting: ApplySettings = (config) => {
  let shouldApply = false;
  const containersHost = '0.0.0.0';

  // resolve running in a containerized environment automatically by checking 0.0.0.0 as hostname or ip address
  if (serveSettings.containers == null) {
    const serveConfig = getJSONFile<ServeConfigurations>('config/serve.json');
    if (serveConfig?.hostname === containersHost || serveConfig?.ipAddress === containersHost) {
      shouldApply = true;
    }

  } if (serveSettings.containers) {
    shouldApply = true;
  }

  if (shouldApply) {
    const publicPath = `https://${containersHost}:${config.devServer.port}/dist/`;

    config.devServer.host = containersHost;
    (config.devServer.static as Static).publicPath = publicPath;
    ((config.devServer.client as ClientConfiguration).webSocketURL as WebSocketURL).hostname = 'localhost';

    (config.devServer.static as Static).watch = (config.devServer.static as Static).watch || {};
    ((config.devServer.static as Static).watch as {
      aggregateTimeout?: number | undefined;
      poll?: number | boolean | undefined;
    }).poll = 1000;

    ((config.devServer.static as Static).watch as {
      aggregateTimeout?: number | undefined;
      poll?: number | boolean | undefined;
    }).aggregateTimeout = 500;
  }
}
