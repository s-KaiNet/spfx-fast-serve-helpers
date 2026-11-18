---
title: CLI, options and startup
type: feature
status: current
tags:
  - project-kb
  - cli
  - options
  - configuration
  - startup
---

# CLI, options and startup

## Summary

`fast-serve` is a zero-config CLI run in the root of an SPFx 1.24.x project (usually as `"serve": "fast-serve"` in `package.json`). It has five options (`port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay`), settable as flags or in `config/fast-serve.json`, with `config/serve.json` supplying SPFx defaults. At start it checks the SPFx version and the dev certificate, then prints the served components and the SharePoint page URL with the debug query. Any startup failure prints one `[fast-serve]` message and exits with code 1.

## Behavior

### Install and requirements

- Install with `npm install --save-dev spfx-fast-serve-helpers@~1.24.0` (or `pnpm add -D`); plain `npm install` works next to SPFx's default Jest/Babel 7 dependencies, no `--legacy-peer-deps`. Vite and `@vitejs/plugin-react` come with the package; the project adds nothing else.
- The package version follows SPFx: `~1.24.0` serves SPFx 1.24.x. SPFx up to 1.21 uses the classic spfx-fast-serve with `spfx-fast-serve-helpers@~1.21.0` or earlier; SPFx 1.22 and 1.23 are not supported.
- Node 22 (from 22.14), 24 or 26, as SPFx 1.24.
- The SPFx development certificate trusted once per machine (`npx heft trust-dev-cert`, the same certificate `heft start` uses).

### Command line

| Flag | Option | Meaning |
|---|---|---|
| `-p, --port <port>` | `port` | HTTPS port on `localhost` (1–65535) |
| `--page-url <url>` | `pageUrl` | page printed with the debug query; `{tenantDomain}` allowed |
| `--locale <locale>` | `locale` | locale of `localizedResources` strings; normalized to lowercase, must look like `en-us` |
| `--config <name>`, `--serve-config <name>` | `serveConfiguration` | `config/serve.json` `serveConfigurations` entry (default `default`) |
| `--no-overlay` | `overlay: false` | no error overlay over the page; errors still reach the terminal and browser console |
| `-h, --help` / `-v, --version` | | print help / the package version, exit 0 |

Flags are parsed strictly: an unknown flag or a positional argument prints the error plus the help text and exits with 1. Stop the server with Ctrl+C (SIGINT/SIGTERM close it cleanly). HTTPS is always on and is not an option; there is no `vite.config` and no logging, lint, type-check or `hotRefresh` option.

### `config/fast-serve.json`

Optional, JSON with comments, for example `{ "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us", "serveConfiguration": "default", "overlay": true }`. The file must be a JSON object; `$schema` is ignored; any other unknown key or a value of the wrong type is a fatal error naming the key and the supported keys.

### Precedence

1. command-line flags;
2. `config/fast-serve.json`;
3. SPFx defaults from `config/serve.json` (`port`, serve configuration pages, `initialPage`);
4. built-in defaults: port `4321`, locale `en-us`, overlay on.

The page follows heft's order with the `pageUrl` option in place of heft's fallbacks:

1. `pageUrl` of the serve configuration selected with `--config` / `serveConfiguration`, unless it is `default`;
2. the `pageUrl` option (flag, then file);
3. `serveConfigurations.default.pageUrl`;
4. `initialPage`.

So `--config commands` opens that configuration's list page even when `config/fast-serve.json` sets a `pageUrl`. Serve configuration details are in [Serving web parts, extensions and ACEs](serving-components.md).

### `{tenantDomain}`

`{tenantDomain}` in the chosen page URL is replaced with the `SPFX_SERVE_TENANT_DOMAIN` environment variable (for example `contoso.sharepoint.com`; a leading `https://` and trailing slashes are stripped). If the variable is not set, no page URL is printed; the banner says to set it and shows the query to append instead.

### Ready banner

```
[fast-serve] ready in 340 ms at https://localhost:4321
[fast-serve] web parts: HelloWorldWebPart
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
```

- One line each for web parts, extensions (with their extension type) and Adaptive Card Extensions, then `serve configuration: <name>` when one is selected.
- `open:` is the page with the debug query, which replaces the page URL's own query (a `#hash` is kept). Without a page, the banner prints `append to your SharePoint page URL: ?debugManifestsFile=…`.
- A final reminder that the debug query sticks to the browser tab: after stopping `fast-serve`, open the page in a new tab (see [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)).
- The URL is printed, never opened automatically.
- The server is ready at once: dependencies are pre-bundled in the background and project files compile when the page first requests them (there is no startup warmup), so the first page load after a start takes longer than later ones. Sass and static-asset typings are regenerated right after the server starts listening.

### Startup failures (exit code 1)

| Condition | Message (abridged) |
|---|---|
| not an SPFx project (no SPFx package in `package.json`) | `This folder is not an SPFx project …` |
| SPFx declared but not installed | `… is listed in package.json but not installed. Install the project dependencies first` |
| SPFx `major.minor` differs from the package | `Unsupported SPFx version: …` plus a hint: classic spfx-fast-serve for ≤ 1.21, upgrade for 1.22/1.23, a newer release for newer SPFx |
| no `config/config.json` | `config/config.json not found. Run fast-serve in an SPFx project folder.` |
| no web part, extension or ACE in the bundles | `No web parts, extensions or Adaptive Card Extensions found` |
| invalid port, locale or options file | `Invalid port …`, `Invalid locale …`, `config/fast-serve.json: unknown option or wrong type …` |
| missing or broken dev certificate | `No valid SPFx development certificate found. Run "npx heft trust-dev-cert" …` |
| port taken | `Port 4321 is already in use (another fast-serve or "heft start" may be running) …` with `--port 4322` / `"port"` suggestions |

Warnings that don't stop the server: an unknown serve configuration name, serve configuration mismatches, a component without `manifest`/`entrypoint`, an unsupported `componentType` (library components are skipped), a `tsconfig.json` that can't be read (ignored).

## Implementation Notes

- The CLI layer only parses flags and maps them to options; the dev server bootstrap merges flags, the options file and `serve.json` defaults in the configuration component, which also selects the serve configuration and page.
- Order at start: SPFx version check → project model and options (warnings printed) → certificate → Vite server → listen → ready banner. The version comes from `@microsoft/sp-core-library`, falling back to `@microsoft/spfx-heft-plugins`. See [Startup and request flows](../architecture/runtime-flows.md).
- Options, the selected serve configuration and the printed URL are fixed for the server's lifetime; editing `config/serve.json` or `config/fast-serve.json` needs a restart to change the URL.

## Edge Cases

- `heft start` and `fast-serve` default to the same port 4321; run only one.
- A page URL with `{tenantDomain}` but no `SPFX_SERVE_TENANT_DOMAIN` falls back to the append-the-query hint, not to a later page in the order.
- `--config` and `--serve-config` are aliases; if both are given, `--config` wins.
- Migrating from the classic spfx-fast-serve: `openUrl` → `pageUrl`, `config` → `--config`, `fullScreenErrors` → `overlay`; `hotRefresh` is always on; `eslint`, `loggingLevel`, `debug`, `memory`, `reactProfiling`, `webpack.extend.js` have no equivalent; `isLibraryComponent` and `containers` are not supported yet.

## Links

- [Serving web parts, extensions and ACEs](serving-components.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Architecture overview](../architecture/overview.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [Zero-config CLI without a public Vite plugin API](../decisions/zero-config-cli.md)

## Evidence

- Source: user docs, migration guide, project handoff notes, implementation behavior (CLI, configuration and dev server bootstrap components)
- Confidence: high
- Last checked: 2026-11-18
