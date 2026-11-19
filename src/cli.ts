#!/usr/bin/env node
import { hideHttp2StatusMessageWarning } from './nodeWarnings/index.js';
import { runCli } from './runCli.js';
import { errorMessage } from './utils/errors.js';

hideHttp2StatusMessageWarning();

const exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async startServer(cli) {
    const { startDevSession } = await import('./devSession.js');
    const session = await startDevSession({
      root: process.cwd(),
      cli,
      onRestartFailed(error) {
        process.stderr.write(`[fast-serve] restart failed: ${errorMessage(error)}\n`);
        process.exit(1);
      },
    });
    const shutdown = () => {
      void session.close().finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  },
});
if (exitCode !== 0) process.exit(exitCode);
