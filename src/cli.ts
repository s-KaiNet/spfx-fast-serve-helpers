#!/usr/bin/env node
import { createConsoleLogger } from './logger.js';
import { compileOnce, OUTPUT_FOLDER } from './rspack/index.js';
import { runCli } from './runCli.js';
import { describeSetup, prepareServe } from './setup/index.js';
import { toPosix } from './utils/paths.js';

const exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  async startServer(cli) {
    const logger = createConsoleLogger();
    const setup = prepareServe({ root: process.cwd(), cli, logger });
    for (const line of describeSetup(setup)) logger.info(line);
    const result = await compileOnce({ ...setup, logger });
    for (const error of result.errors) logger.error(error);
    for (const warning of result.warnings) logger.warn(warning);
    logger.info(`compiled in ${result.durationMs} ms: ${result.errors.length} errors, ${result.warnings.length} warnings, output in ${toPosix(OUTPUT_FOLDER)}`);
    throw new Error('the Rspack dev server is not implemented yet on this branch');
  },
});
if (exitCode !== 0) process.exit(exitCode);
