import { ApplySettings, ServeConfigurations } from '../common/types';
import { argv } from 'yargs';
import { URL } from 'url';
import { getJSONFile } from '../webpack/helpers';

export const applyOpenUrlSetting: ApplySettings = (config, settings) => {
  const configName = argv['config'];

  // SPFx serveConfigurations support
  if (configName) {

    const serveConfig = getJSONFile<ServeConfigurations>('config/serve.json');
    if (serveConfig.serveConfigurations[configName]) {
      const configValue = serveConfig.serveConfigurations[configName];
      const openUrl = new URL(configValue.pageUrl);
      openUrl.searchParams.set('debugManifestsFile', 'https://localhost:4321/temp/manifests.js');

      if (configValue.customActions) {
        openUrl.searchParams.set('loadSPFX', 'true');
        openUrl.searchParams.set('customActions', JSON.stringify(configValue.customActions));
      }

      if (configValue.fieldCustomizers) {
        openUrl.searchParams.set('loadSPFX', 'true');
        openUrl.searchParams.set('fieldCustomizers', JSON.stringify(configValue.fieldCustomizers));
      }

      config.devServer.open = true;
      config.devServer.openPage = openUrl.href;
    } else {
      throw new Error(`Unable to find serve configuration with name '${configName}' in serve.json`);
    }
    return;
  }

  if (!settings.openUrl) {
    config.devServer.open = false;
  } else {
    config.devServer.open = true;
    config.devServer.openPage = settings.openUrl;
  }
}
