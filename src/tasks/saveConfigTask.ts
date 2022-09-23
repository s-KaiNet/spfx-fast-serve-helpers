import { writeFileSync, existsSync, mkdirSync } from 'fs';
import * as path from 'path';

export function addSaveConfigTask(build: any): void {
  const saveConfigTask = build.subTask('save-webpack-config', (gulp: any, config: any, done: () => void) => {
    const serveAdditionalConfig = (generatedConfiguration: any) => {
      const saveDir = path.join(config.rootPath, 'temp');
      const saveTo = path.join(saveDir, '_webpack_config.json');
      if (!existsSync(saveDir)) {
        mkdirSync(saveDir);
      }

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
