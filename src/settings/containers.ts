import { ApplySettings, ServeConfigurations } from '../common/types';
import { getJSONFile } from '../common/helpers';
import { serveSettings } from '../common/settingsManager';

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
    config.devServer.publicPath = publicPath;
    config.devServer.sockHost = 'localhost';

    config.devServer.watchOptions = config.devServer.watchOptions || {};
    config.devServer.watchOptions.aggregateTimeout = 500;
    config.devServer.watchOptions.poll = 1000;
  }
}
