#!/usr/bin/env node
import { createConsoleLogger } from './logger.js';
import { runCli } from './runCli.js';
import { startDevServer } from './server/index.js';
import { describeSetup, prepareServe } from './setup/index.js';
import { closeOnShutdownSignal } from './shutdown.js';

const exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async startServer(cli) {
    const logger = createConsoleLogger();
    const setup = prepareServe({ root: process.cwd(), cli, logger });
    for (const line of describeSetup(setup)) logger.info(line);
    const server = await startDevServer({ setup, logger });
    closeOnShutdownSignal(server.close, (code) => process.exit(code));
  },
});
if (exitCode !== 0) process.exit(exitCode);
