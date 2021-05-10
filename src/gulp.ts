type Build = typeof import('@microsoft/sp-build-web');

import { argv } from 'yargs';
import { writeFileSync } from 'fs';
import * as path from 'path';
import * as del from 'del';
import { hostname } from 'os';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const workbenchApi = require('@microsoft/sp-webpart-workbench/lib/api');

export function addFastServe(build: Build) {
  const useCustomServe = argv['custom-serve'];

  const deleteDefinitions = build.subTask('delete-scss-definitions-task', function (gulp, buildOptions, done) {
    del.sync(['src/**/*.scss.d.ts']);

    done();
  });

  build.rig.addPreBuildTask(build.task('delete-scss-definitions', deleteDefinitions));

  if (!useCustomServe) return;

  trackAnalytics();

  const ensureWorkbenchSubtask = build.subTask('ensure-workbench', function (gulp, buildOptions, done) {
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