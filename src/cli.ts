#!/usr/bin/env node
import { createConsoleLogger } from './logger.js';
import { runCli } from './runCli.js';
import { describeSetup, prepareServe } from './setup/index.js';

const exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  startServer(cli) {
    const logger = createConsoleLogger();
    const setup = prepareServe({ root: process.cwd(), cli, logger });
    for (const line of describeSetup(setup)) logger.info(line);
    return Promise.reject(new Error('the Rspack dev server is not implemented yet on this branch'));
  },
});
if (exitCode !== 0) process.exit(exitCode);
