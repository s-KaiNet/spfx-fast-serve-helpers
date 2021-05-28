type Build = typeof import('@microsoft/sp-build-web');

import { argv } from 'yargs';
import * as path from 'path';
import { hostname } from 'os';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import del from 'del';
import { Settings } from './common/settings';
import { getJSONFile } from './webpack/helpers';
import { addFastServeTask, addWorkbenchTask, addSaveConfigTask } from './tasks';

export function addFastServe(build: Build) {
  let useCustomServe = argv['custom-serve'];
  const isRegularServe = argv._.indexOf('serve') !== -1;
  const settings = getJSONFile<Settings>('fast-serve/config.json');
  const isClean = argv._.indexOf('clean') !== -1;

  if (isClean) {
    del.sync(['src/**/*.module.scss.d.ts'], { cwd: path.resolve(process.cwd()) });
  }

  if (settings.serve?.replaceNativeServe && isRegularServe) {
    build.serve.enabled = false;

    addFastServeTask(build);

    useCustomServe = true;
  }

  if (!useCustomServe) return;

  trackAnalytics();

  build.tslintCmd.enabled = false;

  addWorkbenchTask(build);
  addSaveConfigTask(build);
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