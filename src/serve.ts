#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'cross-spawn';
import * as path from 'path';

(async () => {
  try {


    console.log(process.cwd());
    await runGulp();
    spawnDevServer();
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
})();

function spawnDevServer() {
  const env = { ...process.env };

  // https://stackoverflow.com/a/69699772/434967
  const nodeMajorVersion = parseInt(process.version.split('.')[0].substring(1), 10);
  if (nodeMajorVersion >= 17) {
    if (!env['NODE_OPTIONS']) {
      env['NODE_OPTIONS'] = '';
    }
    env['NODE_OPTIONS'] += ' --openssl-legacy-provider';
  }

  const proc = spawn('node', [path.resolve(__dirname, 'webpack/devServer.js'), ...process.argv.slice(2)], {
    stdio: 'inherit',
    env
  })

  process.on('SIGTERM', () => proc.kill('SIGTERM'))
  process.on('SIGINT', () => proc.kill('SIGINT'))
  process.on('SIGBREAK', () => proc.kill('SIGBREAK'))
  process.on('SIGHUP', () => proc.kill('SIGHUP'))

  proc.on('exit', (code, signal) => {
    let crossEnvExitCode = code
    if (crossEnvExitCode === null) {
      crossEnvExitCode = signal === 'SIGINT' ? 0 : 1
    }
    process.exit(crossEnvExitCode)
  });
}

async function runGulp(): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('gulp', ['bundle', '--custom-serve', '--max-old-space-size=8192'], {
      stdio: 'inherit',
      env: process.env
    });

    process.on('SIGTERM', () => proc.kill('SIGTERM'))
    process.on('SIGINT', () => proc.kill('SIGINT'))
    process.on('SIGBREAK', () => proc.kill('SIGBREAK'))
    process.on('SIGHUP', () => proc.kill('SIGHUP'))

    proc.on('exit', (code, signal) => {
      let crossEnvExitCode = code
      if (crossEnvExitCode === null) {
        crossEnvExitCode = signal === 'SIGINT' ? 0 : 1
      }

      console.log(`exit code: ${crossEnvExitCode}`);
      console.log(`signal: ${signal}`);

      if (crossEnvExitCode == 1) {
        reject("The gulp task failed.");
      } else if (crossEnvExitCode == 0) {
        resolve();
      } else {
        throw new Error(`gulp exited with unexpected code: ${crossEnvExitCode}`);
      }
    });

  });
}
