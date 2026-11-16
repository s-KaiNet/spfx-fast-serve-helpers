import { parseArgs } from 'node:util';
import { packageName, packageVersion } from './packageInfo.js';

export interface CliOutput {
  out(text: string): void;
  err(text: string): void;
}

const helpText = `${packageName} ${packageVersion}
Vite dev server for SharePoint Framework 1.24.x projects (work in progress).

Usage: fast-serve [options]

Options:
  -h, --help     Show this help
  -v, --version  Show the version
`;

/** Runs the CLI with the given arguments and returns the process exit code. */
export function runCli(args: string[], output: CliOutput): number {
  let values: { help?: boolean; version?: boolean };
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
    output.err(`${error instanceof Error ? error.message : String(error)}\n\n${helpText}`);
    return 1;
  }

  if (values.version) {
    output.out(`${packageVersion}\n`);
    return 0;
  }

  // The dev server is not implemented yet: for now every other invocation prints help.
  output.out(helpText);
  return 0;
}
