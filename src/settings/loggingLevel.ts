import { ApplySettings } from '../common/types';
import { getLoggingLevel } from '../common/helpers';

export const applyLoggingLevel: ApplySettings = (config, settings) => {
  config.devServer.stats = getLoggingLevel(settings.loggingLevel);
}
