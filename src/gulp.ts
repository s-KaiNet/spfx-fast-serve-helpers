type Build = typeof import('@microsoft/sp-build-web');

import { argv } from 'yargs';
import { writeFileSync } from 'fs';
import * as path from 'path';
import { hostname } from 'os';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import del from 'del';
import { Settings } from './common/settings';
import { getJSONFile } from './webpack/helpers';
import { startDevServer } from './webpack/devServer';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const workbenchApi = require('@microsoft/sp-webpart-workbench/lib/api');

export function addFastServe(build: Build) {
  let useCustomServe = argv['custom-serve'];
  const isRegularServe = argv._.indexOf('serve') !== -1;
  const settings: Settings = getJSONFile('fast-serve/config.json');
  const isClean = argv._.indexOf('clean') !== -1;

  if (isClean) {
    del.sync(['src/**/*.module.scss.d.ts'], { cwd: path.resolve(process.cwd()) });
  }
  if (settings.serve?.replaceNativeServe && isRegularServe) {
    build.serve.enabled = false;

    const fastServeTask = build.subTask('fast-serve', function () {
      startDevServer();
    });

    build.rig.addPostBundleTask(fastServeTask);
    useCustomServe = true;
  }

  if (!useCustomServe) return;

  trackAnalytics();

  build.tslintCmd.enabled = false;

  const ensureWorkbenchSubtask = build.subTask('ensure-workbench', function (gulp, config, done) {
    try {
      workbenchApi.default['/workbench']();
    } catch (e) {
      //
    }

    done();
  });

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
  build.rig.addPostBuildTask(ensureWorkbenchSubtask);
}

function trackAnalytics() {
  try {
    const hostNameHash = createHash('md5').update(hostname()).digest('hex');

    fetch('https://fast-serve-track.azurewebsites.net/api/track', {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': 'TX0jA2PGYZQFJgeJeqSJbRcYwV7tx72vOD2LkICWxLe1O0f6KxxLaQ=='
      },
      body: JSON.stringify({
        hostNameHash
      })
    });
  }
  catch (err) {
    //
  }
}