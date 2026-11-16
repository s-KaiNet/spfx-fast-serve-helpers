#!/usr/bin/env node
import { runCli } from './runCli.js';

process.exitCode = runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
});
