import { ApplySettings, ServeConfigurations } from '../common/types';
import colors from 'colors';
import { URL } from 'url';
import { getJSONFile } from '../common/helpers';
import { Logger } from '../common/logger';
import { serveSettings } from '../common/settingsManager';

const SERVE_SPFX_KEY = 'SPFX_SERVE_TENANT_DOMAIN';
const SERVE_SPFX_PLACEHOLDER = '{tenantDomain}';

export const applyOpenUrlSetting: ApplySettings = (config) => {
  const configName = serveSettings.config;

  // SPFx serveConfigurations support
  if (configName) {

    const serveConfig = getJSONFile<ServeConfigurations>('config/serve.json');
    if (serveConfig.serveConfigurations?.[configName]) {
      const configValue = serveConfig.serveConfigurations[configName];
      let openUrl = new URL(configValue.pageUrl);

      if (process.env[SERVE_SPFX_KEY] != null) {
        openUrl = new URL(configValue.pageUrl.replace(SERVE_SPFX_PLACEHOLDER, process.env[SERVE_SPFX_KEY]));
      }

      openUrl.searchParams.set('debugManifestsFile', `https://${config.devServer.host}:${config.devServer.port}/temp/manifests.js`);
      openUrl.searchParams.set('loadSPFX', 'true');

      if (configValue.customActions) {
        openUrl.searchParams.set('customActions', JSON.stringify(configValue.customActions));
      }

      if (configValue.fieldCustomizers) {
        openUrl.searchParams.set('fieldCustomizers', JSON.stringify(configValue.fieldCustomizers));
      }

      if (configValue.formCustomizer) {
        for (const property in configValue.formCustomizer) {
          if (Object.prototype.hasOwnProperty.call(configValue.formCustomizer, property)) {
            const value = configValue.formCustomizer[property];

            if (typeof value === 'object') {
              openUrl.searchParams.set(property, JSON.stringify(value));
            } else {
              openUrl.searchParams.set(property, value);
            }
          }
        }
      }

      config.devServer.open = openUrl.href;

      Logger.log(`Loading ${colors.yellow(configName)} serve configuration and opening ${colors.green(openUrl.href)}`);
    } else {
      throw new Error(`Unable to find serve configuration with name '${configName}' in serve.json`);
    }
    return;
  }

  if (!serveSettings.openUrl) {
    config.devServer.open = false;
  } else {
    if (process.env[SERVE_SPFX_KEY] != null) {
      config.devServer.open = new URL(serveSettings.openUrl.replace(SERVE_SPFX_PLACEHOLDER, process.env[SERVE_SPFX_KEY])).href;
    } else {
      config.devServer.open = serveSettings.openUrl;
    }
  }
}
