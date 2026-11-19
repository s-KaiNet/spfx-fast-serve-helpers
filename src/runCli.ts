import { parseArgs } from 'node:util';
import { packageName, packageVersion } from './packageInfo.js';

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
}

export const helpText = `${packageName} ${packageVersion}
Rspack dev server for SharePoint Framework 1.24.x projects (work in progress).

Usage: fast-serve [options]

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

export const notImplementedText = '[fast-serve] the Rspack dev server is not implemented yet on this branch\n';

export function runCli(args: string[], io: CliIo): number {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      strict: true,
      allowPositionals: false,
    }));
  } catch (error) {
    io.err(`${error instanceof Error ? error.message : String(error)}\n\n${helpText}`);
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
  io.err(notImplementedText);
  return 1;
}
