import { writeFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';
import webpack from 'webpack';
import { ManifestPlugin } from '@microsoft/spfx-heft-plugins/lib/spfxManifests/webpack/ManifestPlugin';

export function addSaveConfigTask(build: any): void {
  const saveConfigTask = build.subTask('save-webpack-config', (gulp: any, config: any, done: () => void) => {
    const serveAdditionalConfig = (generatedConfiguration: webpack.Configuration) => {
      const saveDir = path.join(config.rootPath, 'temp');
      const saveTo = path.join(saveDir, '_webpack_config.json');
      if (!existsSync(saveDir)) {
        mkdirSync(saveDir);
      }

      let pluginOptions = null;
      for (const plugin of generatedConfiguration.plugins) {
        if (typeof plugin === 'object' && plugin.constructor && plugin.constructor.name === 'ManifestPlugin') {
          pluginOptions = plugin._options;
          break;
        }
      }

      if (pluginOptions == null) throw new Error('ManifestPlugin not found in webpack plugins');

      generatedConfiguration.plugins.push(new ManifestPlugin({
        ...pluginOptions,
        useManifestsJsonForComponentDependencies: true
      }));

      writeFileSync(saveTo, JSON.stringify(generatedConfiguration, null, 2));

      return generatedConfiguration;
    }

    if (!build.configureWebpack.taskConfig.additionalConfiguration) {
      build.configureWebpack.mergeConfig({
        additionalConfiguration: serveAdditionalConfig
      });
    } else {
      const oldConfigFunc = build.configureWebpack.taskConfig.additionalConfiguration;
      build.configureWebpack.mergeConfig({
        additionalConfiguration: (generatedConfiguration: any) => {
          generatedConfiguration = oldConfigFunc(generatedConfiguration);

          return serveAdditionalConfig(generatedConfiguration);
        }
      });
    }

    done();
  });

  build.rig.addPostTypescriptTask(saveConfigTask);
}
