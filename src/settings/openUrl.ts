import { ApplySettings } from '../common/types';

export const applyOpenUrlSetting: ApplySettings = (config, settings) => {
  const localWorkbenchUrl = `https://${config.devServer.host}:${config.devServer.port}/temp/workbench.html`;
  config.devServer.openPage = settings.openUrl ? settings.openUrl : localWorkbenchUrl;
}
