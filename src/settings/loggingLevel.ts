import { ApplySettings } from '../common/types';
import { getLoggingLevel } from '../common/helpers';
import { serveSettings } from '../common/settingsManager';

export const applyLoggingLevel: ApplySettings = (config) => {
  config.devServer.stats = getLoggingLevel(serveSettings.loggingLevel);
}
