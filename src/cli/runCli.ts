import type { FastServeOptions } from '../config/index.js';
import { packageVersion } from '../shared/packageInfo.js';
import { errorMessage } from '../shared/errors.js';
import { cliOptions, parseCliArgs, type CliValues } from './args.js';
import { helpText } from './help.js';

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  startServer(options: FastServeOptions): Promise<void>;
}

export async function runCli(args: string[], io: CliIo): Promise<number> {
  let values: CliValues;
  try {
    values = parseCliArgs(args);
  } catch (error) {
    io.err(`${errorMessage(error)}\n\n${helpText}`);
    return 1;
  }

  if (values.help) {
    io.out(helpText);
    return 0;
  }
  if (values.version) {
    io.out(`${packageVersion}\n`);
    return 0;
  }

  try {
    await io.startServer(cliOptions(values));
    return 0;
  } catch (error) {
    io.err(`[fast-serve] ${errorMessage(error)}\n`);
    return 1;
  }
}
