#!/usr/bin/env node
import { runCli } from './runCli.js';

process.exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async startServer(cli) {
    const { startDevServer } = await import('./devServer.js');
    const server = await startDevServer({ root: process.cwd(), cli });
    const shutdown = () => {
      void server.close().finally(() => process.exit(0));
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
  },
});
