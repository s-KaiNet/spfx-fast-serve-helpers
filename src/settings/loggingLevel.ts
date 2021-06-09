import { ApplySettings } from '../common/types';
import { getLoggingLevel } from '../webpack/helpers';

export const applyLoggingLevel: ApplySettings = (config, settings) => {
  config.devServer.stats = getLoggingLevel(settings.loggingLevel);
}
