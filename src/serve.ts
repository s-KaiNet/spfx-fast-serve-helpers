#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'child_process';

import { startDevServer } from './webpack/devServer';

const bundleProcess = spawn('gulp', ['bundle', '--custom-serve', '--max_old_space_size=4096'], {
  stdio: ['inherit'],
  cwd: process.cwd(),
  shell: true
});

bundleProcess.stdout.on('data', (data) => {
  process.stdout.write(data.toString());
});

bundleProcess.stderr.on('data', (data) => {
  process.stdout.write(data.toString());
});

bundleProcess.on('close', (code) => {
  if (code !== 0) {
    return;
  }

  (async () => {
    await startDevServer();
  })();
});
