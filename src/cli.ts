#!/usr/bin/env node
import { createConsoleLogger } from './logger.js';
import { terminalPortCheck } from './server/index.js';
import { runCli } from './runCli.js';
import { startDevSession } from './session/index.js';
import { closeOnShutdownSignal } from './shutdown.js';
import { errorMessage } from './utils/errors.js';

const exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async startServer(cli) {
    const logger = createConsoleLogger();
    const session = await startDevSession({
      root: process.cwd(),
      cli,
      logger,
      portCheck: terminalPortCheck({ logger }),
      onRestartFailed(error) {
        logger.error(`restart failed: ${errorMessage(error)}`);
        process.exit(1);
      },
    });
    closeOnShutdownSignal(() => session.close(), (code) => process.exit(code));
  },
});
if (exitCode !== 0) process.exit(exitCode);
