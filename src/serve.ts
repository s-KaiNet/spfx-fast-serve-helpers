#!/usr/bin/env node
/* eslint-disable no-console */

import { spawn } from 'child_process';

import { startDevServer } from './webpack/devServer';

const ls = spawn('gulp', ['bundle', '--custom-serve', '--max_old_space_size=4096'], {
  env: process.env,
  stdio: ['inherit'],
  cwd: process.cwd(),
  shell: true
});

ls.stdout.on('data', (data) => {
  process.stdout.write(data.toString());
});

ls.stderr.on('data', (data) => {
  process.stdout.write(data.toString());
});

ls.on('close', (code) => {
  if (code !== 0) {
    return;
  }

  (async () => {
    await startDevServer();
  })();
});
