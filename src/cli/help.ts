import { DEFAULT_PORT, DEFAULT_SERVE_CONFIGURATION, OPTIONS_FILE, OPTIONS_SCHEMA_PATH, TENANT_DOMAIN_ENV } from '../config/index.js';
import { DEFAULT_LOCALE } from '../project/index.js';
import { packageName, packageVersion } from '../shared/packageInfo.js';
import { EXTEND_FILE } from '../bundler/extend/files.js';
import { RSPACK_CONFIG_DOCS_URL } from '../bundler/extend/webpackHint.js';

export const helpText = `${packageName} ${packageVersion}
Rspack dev server for SharePoint Framework 1.24.x projects. Run it in the project folder.

Usage: fast-serve [options]

Options:
  -p, --port <port>      HTTPS port (default: config/serve.json "port", else ${DEFAULT_PORT})
      --page-url <url>   Your SharePoint test page, printed at start with the debug query
                         (default: config/serve.json serve configuration page, then "initialPage";
                         {tenantDomain} = $${TENANT_DOMAIN_ENV})
      --locale <locale>  Locale of localized strings (default: ${DEFAULT_LOCALE})
      --config <name>    config/serve.json "serveConfigurations" entry: prints its extension
                         query (customActions, fieldCustomizers, formCustomizer) next to the
                         web-part query (default: "${DEFAULT_SERVE_CONFIGURATION}"; alias: --serve-config)
      --no-overlay       Don't show compile, runtime and type errors in an overlay over the
                         page (they still go to the terminal and the browser console)
      --no-type-check    Don't type check the project in the background (on by default, with
                         the project's own TypeScript; results in the terminal and the overlay;
                         about 1 GB of memory on large projects; heft build still does the full build)
      --type-check       Turn it on when the options file turns it off
      --lint [full]      Lint the files you save with the project's ESLint (on by default;
                         without type-aware rules unless "full"; results in the terminal)
      --no-lint          Turn linting off
  -h, --help             Show this help
  -v, --version          Show the version

The same options can be set in ${OPTIONS_FILE}:
{ "port": ${DEFAULT_PORT}, "pageUrl": "…", "locale": "${DEFAULT_LOCALE}", "serveConfiguration": "${DEFAULT_SERVE_CONFIGURATION}", "overlay": true,
  "typeCheck": true, "lint": true }.
Completion and validation in editors: "$schema": "${OPTIONS_SCHEMA_PATH}".
Command-line flags win over the file. Page: the selected serve configuration's "pageUrl"
(unless it is "default") > --page-url / "pageUrl" > serveConfigurations.default.pageUrl > "initialPage".

Linked SPFx library projects (npm link, npm "file:", pnpm "link:"/"workspace:") are compiled
from their src into your bundles; "deployedLibraries": ["<package>"] loads one from SharePoint instead.

Optional Rspack config merged into fast-serve's (e.g. to mirror a heft webpack customization):
${EXTEND_FILE}, see ${RSPACK_CONFIG_DOCS_URL}
fast-serve restarts when that file, config/*.json, ${OPTIONS_FILE}, package.json or tsconfig change.
`;
