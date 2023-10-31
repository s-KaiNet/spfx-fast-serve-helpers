#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'cross-spawn';
import * as path from 'path';

(async () => {
  // eslint-disable-next-line no-console
  console.log(process.cwd());
  await runGulp();
  spawnDevServer();
})();

function spawnDevServer() {
  const env = { ...process.env };

  const nodeMajorVersion = parseInt(process.version.split('.')[0].substring(1), 10);

  if (nodeMajorVersion >= 17) {
    env['NODE_OPTIONS'] = '--openssl-legacy-provider';
  }

  const proc = spawn('node', [path.resolve(__dirname, 'webpack/devServer.js')], {
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
  return new Promise((resolve) => {
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
      resolve();
      //process.exit(crossEnvExitCode);
    });

  });
}
