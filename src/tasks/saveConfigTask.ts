type Build = typeof import('@microsoft/sp-build-web');
import { writeFileSync } from 'fs';
import * as path from 'path';

export function addSaveConfigTask(build: Build): void {
  const saveConfigTask = build.subTask('save-webpack-config', (gulp, config, done) => {
    const serveAdditionalConfig = (generatedConfiguration: any) => {
      const saveTo = path.join(config.rootPath, 'temp/_webpack_config.json');
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
        additionalConfiguration: (generatedConfiguration) => {
          generatedConfiguration = oldConfigFunc(generatedConfiguration);

          return serveAdditionalConfig(generatedConfiguration);
        }
      });
    }

    done();
  });

  build.rig.addPostTypescriptTask(saveConfigTask);
}
