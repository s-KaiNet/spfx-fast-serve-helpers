import { argv } from 'yargs';
import * as path from 'path';
import { hostname, userInfo } from 'os';
import { createHash } from 'crypto';
import fetch from 'node-fetch';
import del from 'del';
import { addSaveConfigTask } from './tasks';

export function addFastServe(build: any) {
  const useCustomServe = argv['custom-serve'];
  const isClean = argv._.indexOf('clean') !== -1;

  if (isClean) {
    del.sync(['src/**/*.module.scss.d.ts', 'release'], { cwd: path.resolve(process.cwd()) });
  }

  if (!useCustomServe) return;

  trackAnalytics();

  // https://github.com/s-KaiNet/spfx-fast-serve/issues/64
  build.addSuppression(/Error processing webpack stats: TypeError/gi);
  build.addSuppression(/Webpack error: RangeError: Invalid string length/gi);

  build.tslintCmd.enabled = false;

  addSaveConfigTask(build);
}

async function trackAnalytics() {
  try {

    let username = 'default';
    try {
      username = userInfo().username;
    }
    catch (e) {
      //
    }
    
    const hostNameHash = createHash('md5').update(hostname() + '@' + username).digest('hex');

    await fetch('https://fast-serve-track.azurewebsites.net/api/track', {
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
