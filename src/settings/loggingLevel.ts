import { ApplySettings } from '../common/types';
import { getLoggingLevel } from '../common/helpers';
import { serveSettings } from '../common/settingsManager';

export const applyLoggingLevel: ApplySettings = (config) => {
  config.devServer.devMiddleware.stats = getLoggingLevel(serveSettings.loggingLevel);
}
