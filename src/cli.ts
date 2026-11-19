#!/usr/bin/env node
import { runCli } from './runCli.js';

const exitCode = runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
process.exitCode = exitCode;
