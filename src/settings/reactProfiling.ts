import { ExternalsElement } from 'webpack';
import { ApplySettings } from '../common/types';

export const applyReactProfilingSetting: ApplySettings = (config, settings) => {
  if (settings.reactProfiling) {
    config.externals = (config.externals as ExternalsElement[]).filter((external) => {
      return ((external !== 'react') && (external !== 'react-dom'));
    });

    config.resolve.alias = {
      'react-dom$': 'react-dom/profiling'
    };
  }
}
