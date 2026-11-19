import { parseArgs } from 'node:util';
import { DEFAULT_PORT, DEFAULT_SERVE_CONFIGURATION, OPTIONS_FILE, parsePort, TENANT_DOMAIN_ENV, type FastServeOptions } from './config/options.js';
import { DEFAULT_LOCALE } from './project/index.js';
import { packageName, packageVersion } from './packageInfo.js';
import { errorMessage } from './utils/errors.js';
import { VITE_EXTEND_FILE } from './viteExtend/files.js';
import { VITE_CONFIG_DOCS_URL } from './viteExtend/webpackHint.js';

export interface CliIo {
  out(text: string): void;
  err(text: string): void;

  startServer(options: FastServeOptions): Promise<void>;
}

const helpText = `${packageName} ${packageVersion}
Vite dev server for SharePoint Framework 1.24.x projects. Run it in the project folder.

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
  -h, --help             Show this help
  -v, --version          Show the version

The same options can be set in ${OPTIONS_FILE}:
{ "port": ${DEFAULT_PORT}, "pageUrl": "…", "locale": "${DEFAULT_LOCALE}", "serveConfiguration": "${DEFAULT_SERVE_CONFIGURATION}", "overlay": true }.
Command-line flags win over the file. Page: the selected serve configuration's "pageUrl"
(unless it is "default") > --page-url / "pageUrl" > serveConfigurations.default.pageUrl > "initialPage".

Optional Vite config merged into fast-serve's (e.g. to mirror a heft webpack customization):
${VITE_EXTEND_FILE}, see ${VITE_CONFIG_DOCS_URL}
`;

export async function runCli(args: string[], io: CliIo): Promise<number> {
  let values;
  try {
    ({ values } = parseArgs({
      args,
      options: {
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
        port: { type: 'string', short: 'p' },
        'page-url': { type: 'string' },
        locale: { type: 'string' },
        config: { type: 'string' },
        'serve-config': { type: 'string' },
        'no-overlay': { type: 'boolean' },
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
    await io.startServer(options);
    return 0;
  } catch (error) {
    io.err(`[fast-serve] ${errorMessage(error)}\n`);
    return 1;
  }
}
