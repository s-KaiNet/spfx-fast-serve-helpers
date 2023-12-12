#!/usr/bin/env node
/* eslint-disable no-console */

import * as path from 'path';
import { Logger } from './common/logger';
import { spawnProcess } from './common/spawnProcess';
import { needToRunBundle } from './webpack/helpers';

(async () => {
  try {

    console.log(process.env.npm_lifecycle_event);
    console.log(process.cwd());

    if (needToRunBundle()) {
      await spawnProcess('gulp', ['bundle', '--custom-serve', '--max-old-space-size=8192']);
    }
    await spawnDevServer();

  } catch (error) {
    if (error) {
      Logger.error(error?.message || error.toString());
      throw error;
    } else {
      Logger.error("The process exited with an error");
      process.exit(1);
    }
  }
})();

async function spawnDevServer(): Promise<void> {
  const env = { ...process.env };

  // https://stackoverflow.com/a/69699772/434967
  const nodeMajorVersion = parseInt(process.version.split('.')[0].substring(1), 10);
  if (nodeMajorVersion >= 17) {
    if (!env['NODE_OPTIONS']) {
      env['NODE_OPTIONS'] = '';
    }
    env['NODE_OPTIONS'] += ' --openssl-legacy-provider';
  }

  return await spawnProcess('node', [path.resolve(__dirname, `webpack/devServer.js`), ...process.argv.slice(2)], env);
}
