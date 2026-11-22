import { parseArgs } from 'node:util';
import { DEFAULT_PORT, DEFAULT_SERVE_CONFIGURATION, OPTIONS_FILE, parsePort, TENANT_DOMAIN_ENV, type FastServeOptions, type LintSetting } from './config/index.js';
import { DEFAULT_LOCALE } from './project/index.js';
import { packageName, packageVersion } from './packageInfo.js';
import { errorMessage } from './utils/errors.js';
import { EXTEND_FILE } from './extend/files.js';
import { RSPACK_CONFIG_DOCS_URL } from './extend/webpackHint.js';

export interface CliIo {
  out(text: string): void;
  err(text: string): void;
  startServer(options: FastServeOptions): Promise<void>;
}

const helpText = `${packageName} ${packageVersion}
Rspack dev server for SharePoint Framework 1.24.x projects. Run it in the project folder.

Usage: fast-serve [options]

Options:
  -p, --port <port>      HTTPS port (default: config/serve.json "port", else ${DEFAULT_PORT})
      --page-url <url>   SharePoint page to open with the debug query
                         (default: config/serve.json serve configuration page, then "initialPage";
                         {tenantDomain} = $${TENANT_DOMAIN_ENV})
      --locale <locale>  Locale of localized strings (default: ${DEFAULT_LOCALE})
      --config <name>    config/serve.json "serveConfigurations" entry: its page and the
                         extension query parameters (customActions, fieldCustomizers,
                         formCustomizer) (default: "${DEFAULT_SERVE_CONFIGURATION}"; alias: --serve-config)
      --no-overlay       Don't show compile and runtime errors in an overlay over the page
                         (they still go to the terminal and the browser console)
      --type-check       Type check the project in the background with its own TypeScript
                         (results in the terminal; heft build still does the full build)
      --no-type-check    Turn type checking off (wins over "typeCheck": true)
      --type-check-overlay
                         Also show type errors in a panel over the page (needs type checking)
      --lint [full]      Lint the files you save with the project's ESLint (on by default;
                         without type-aware rules unless "full"; results in the terminal)
      --no-lint          Turn linting off
  -h, --help             Show this help
  -v, --version          Show the version

The same options can be set in ${OPTIONS_FILE}:
{ "port": ${DEFAULT_PORT}, "pageUrl": "…", "locale": "${DEFAULT_LOCALE}", "serveConfiguration": "${DEFAULT_SERVE_CONFIGURATION}", "overlay": true,
  "typeCheck": false, "typeCheckOverlay": false, "lint": true }.
Command-line flags win over the file. Page: the selected serve configuration's "pageUrl"
(unless it is "default") > --page-url / "pageUrl" > serveConfigurations.default.pageUrl > "initialPage".

Linked SPFx library projects (npm link, npm "file:", pnpm "link:"/"workspace:") are compiled
from their src into your bundles; "deployedLibraries": ["<package>"] loads one from SharePoint instead.

Optional Rspack config merged into fast-serve's (e.g. to mirror a heft webpack customization):
${EXTEND_FILE}, see ${RSPACK_CONFIG_DOCS_URL}
fast-serve restarts when that file, config/*.json, ${OPTIONS_FILE}, package.json or tsconfig change.
`;

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

export async function runCli(args: string[], io: CliIo): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args: withLintValue(args),
      options: {
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
        'type-check-overlay': { type: 'boolean' },
        lint: { type: 'string' },
        'no-lint': { type: 'boolean' },
      },
      strict: true,
      allowPositionals: false,
    }));
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
    if (values['type-check-overlay']) options.typeCheckOverlay = true;
    if (values.lint !== undefined && values['no-lint']) throw new Error('use either --lint or --no-lint');
    if (values.lint !== undefined) options.lint = lintFlag(values.lint);
    if (values['no-lint']) options.lint = false;
    await io.startServer(options);
    return 0;
  } catch (error) {
    io.err(`[fast-serve] ${errorMessage(error)}\n`);
    return 1;
  }
}
