import { parseArgs } from 'node:util';
import { parsePort, type FastServeOptions, type LintSetting } from '../config/index.js';

const LINT_FLAG = '--lint';
const LINT_ON = 'on';
const LINT_FULL = 'full';

function withLintValue(args: readonly string[]): string[] {
  const normalized: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== LINT_FLAG) {
      if (arg !== undefined) normalized.push(arg);
      continue;
    }
    const next = args[index + 1];
    if (next === LINT_FULL) {
      normalized.push(`${LINT_FLAG}=${LINT_FULL}`);
      index += 1;
    } else normalized.push(`${LINT_FLAG}=${LINT_ON}`);
  }
  return normalized;
}

function lintFlag(value: string): LintSetting {
  if (value === LINT_ON) return true;
  if (value === LINT_FULL) return 'full';
  throw new Error(`Invalid --lint value "${value}" (use --lint, --lint full or --no-lint)`);
}

const CLI_OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'v' },
  port: { type: 'string', short: 'p' },
  'page-url': { type: 'string' },
  locale: { type: 'string' },
  config: { type: 'string' },
  'serve-config': { type: 'string' },
  'no-overlay': { type: 'boolean' },
  'type-check': { type: 'boolean' },
  'no-type-check': { type: 'boolean' },
  lint: { type: 'string' },
  'no-lint': { type: 'boolean' },
} as const;

export function parseCliArgs(args: readonly string[]) {
  return parseArgs({ args: withLintValue(args), options: CLI_OPTIONS, strict: true, allowPositionals: false }).values;
}

export type CliValues = ReturnType<typeof parseCliArgs>;

export function cliOptions(values: CliValues): FastServeOptions {
  const options: FastServeOptions = {};
  if (values.port !== undefined) options.port = parsePort(values.port);
  if (values['page-url'] !== undefined) options.pageUrl = values['page-url'];
  if (values.locale !== undefined) options.locale = values.locale;
  const serveConfiguration = values.config ?? values['serve-config'];
  if (serveConfiguration !== undefined) options.serveConfiguration = serveConfiguration;
  if (values['no-overlay']) options.overlay = false;
  if (values['type-check'] && values['no-type-check']) throw new Error('use either --type-check or --no-type-check');
  if (values['type-check']) options.typeCheck = true;
  if (values['no-type-check']) options.typeCheck = false;
  if (values.lint !== undefined && values['no-lint']) throw new Error('use either --lint or --no-lint');
  if (values.lint !== undefined) options.lint = lintFlag(values.lint);
  if (values['no-lint']) options.lint = false;
  return options;
}
