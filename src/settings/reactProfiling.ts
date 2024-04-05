import { ApplySettings } from '../common/types';
import { serveSettings } from '../common/settingsManager';

export const applyReactProfilingSetting: ApplySettings = (config) => {
  if (serveSettings.reactProfiling) {
    config.externals = (config.externals as any[]).filter((external) => {
      return ((external !== 'react') && (external !== 'react-dom'));
    });

    config.resolve.alias = {
      'react-dom$': 'react-dom/profiling'
    };
  }
}
