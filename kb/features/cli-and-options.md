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

`fast-serve` is a zero-config CLI run in the root of an SPFx 1.24.x project. It has five options, settable as flags or in `fast-serve/config.json` (`port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay`), with `config/serve.json` supplying SPFx defaults. At start it checks the SPFx version, builds the [project model](../architecture/project-model.md), resolves the options, prints a summary, loads the optional [Rspack extend file](rspack-extend-file.md) and starts the [dev server](dev-server.md), which compiles the bundles ([Rspack compile](rspack-compile.md)) and prints the ready banner with the debug URL. A dev session [restarts](project-restarts.md) the server when project configuration changes. It runs until SIGINT or SIGTERM.

## Behavior

### Command line

| Flag | Option | Meaning |
|---|---|---|
| `-p, --port <port>` | `port` | HTTPS port on `localhost`, an integer 1–65535 |
| `--page-url <url>` | `pageUrl` | SharePoint page to open with the debug query; `{tenantDomain}` allowed |
| `--locale <locale>` | `locale` | locale of the `localizedResources` strings; lowercased, must look like `en-us` |
| `--config <name>`, `--serve-config <name>` | `serveConfiguration` | `config/serve.json` `serveConfigurations` entry (default `default`); `--config` wins if both are given |
| `--no-overlay` | `overlay: false` | no error overlay over the page (compile and runtime errors); the terminal and browser console still get them, see [Errors, overlay and terminal output](errors-and-diagnostics.md) |
| `-h, --help` / `-v, --version` | | print help / the package version, exit 0 |

Flags are parsed strictly: an unknown flag or a positional argument prints the error plus the help text and exits with 1. The help text describes the options, `fast-serve/config.json`, the page order, the optional `fast-serve/rspack.extend.mjs` with its docs link, and which files restart the server.

### `fast-serve/config.json`

Optional, JSON with comments and trailing commas, for example `{ "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us", "serveConfiguration": "default", "overlay": true }`. It must be a JSON object; `$schema` is ignored; an unknown key or a wrong value type is fatal and names the key and the supported keys.

`deployedLibraries` (array of package names, file only) keeps linked SPFx library projects external, loaded from SharePoint, instead of compiling their `src` ([local library projects](local-library-projects.md)); a listed name that is no SPFx library dependency prints a warning.

`amdPackages`, an option of the Vite implementation, is ignored with a warning: Rspack bundles AMD and UMD code in dependencies like heft does, so there is nothing to opt out of, and a configuration written for the Vite implementation keeps working.

`config/fast-serve.json` (an early-beta location) is not read; when it exists and `fast-serve/config.json` doesn't, a warning asks to move it.

### Precedence

1. command-line flags;
2. `fast-serve/config.json`;
3. `config/serve.json` (`port`, serve configuration pages, `initialPage`);
4. built-in defaults: port `4321`, locale `en-us`, overlay on.

The page follows heft's order with the `pageUrl` option in place of heft's fallbacks: the selected serve configuration's `pageUrl` unless it is `default` → the `pageUrl` option (flag, then file) → `serveConfigurations.default.pageUrl` → `initialPage`. An unknown serve configuration name warns (listing the available names) and falls back to `default` like heft; without `serveConfigurations` no configuration is selected unless one is asked for. If the chosen page points to the SharePoint Online workbench (`/_layouts/workbench.aspx` or `/_layouts/15/workbench.aspx`, still the generator's `initialPage` in many projects), it is ignored with a warning that names the setting and asks for a SharePoint page; the banner then prints the query to append instead of an `open:` URL. The order does not fall through to a later page.

### `{tenantDomain}`

`{tenantDomain}` in the chosen page is replaced with `SPFX_SERVE_TENANT_DOMAIN` (a leading `https://` and trailing slashes are stripped). Without the variable the page stays unresolved and the summary says to set it; the order does not fall through to a later page.

### Startup order and summary

SPFx version check → warning for the old options file → project model → options file (dropped keys warned) → option resolution → "no components" check → option warnings → warnings for the selected serve configuration ([Extensions and ACEs](extensions-and-aces.md#serve-configurations)) → summary lines with the `[fast-serve]` prefix: package and SPFx version; port, origin, locale, overlay; serve configuration; page; one line per bundle with each component's alias, kind (extension type for extensions) and export name in multi-component bundles; `SPFx libraries from source: <package> (<relative path>)` when linked library projects were found; counts of SPFx libraries, `config.json` externals and localized resources (resolving them may print model warnings, such as a locale falling back to `en-us`, just before the summary). Then the port check, the extend file (`Rspack config: <file>` and guard warnings) or, without one, the [webpack-customization hint](rspack-extend-file.md#startup-hint-for-webpack-customizations), the dev certificate, the first compile and the [ready banner](dev-server.md#debug-url-and-ready-banner).

### Startup failures (exit code 1)

| Condition | Message (abridged) |
|---|---|
| no SPFx package in `package.json` | `This folder is not an SPFx project …` |
| SPFx declared but not installed | `… is listed in package.json but not installed …` |
| SPFx `major.minor` is not 1.24 | `Unsupported SPFx version: …` plus a hint: classic spfx-fast-serve for ≤ 1.21, upgrade for 1.22/1.23, a newer release for newer SPFx |
| no `config/config.json` | `config/config.json not found …` |
| no web part, extension or ACE | `No web parts, extensions or Adaptive Card Extensions found …` |
| bad port, locale or options file | `Invalid port "<value>" (expected 1-65535)`, `Invalid locale …`, `fast-serve/config.json: unknown option or wrong type …` |
| port in use | `Port <n> is already in use … fast-serve --port <n+1> …` |
| no SPFx dev certificate | `No valid SPFx development certificate found. Run "npx heft trust-dev-cert" …` |
| broken extend file | `fast-serve/rspack.extend.mjs could not be loaded:` + error + `Fix or remove the file and run fast-serve again.` |

Every failure is one `[fast-serve] <message>` line on stderr. The SPFx version comes from the installed `@microsoft/sp-core-library`, then `@microsoft/spfx-heft-plugins`, then `@microsoft/sp-webpart-base`; any 1.24.x (also prereleases) is accepted, because the package version follows SPFx `major.minor`.

### Shutdown

SIGINT and SIGTERM wait for a running restart, close the current dev server and compiler once and exit with 0 (1 if closing fails).

## Links

- [Dev server, debug manifests and debug URL](dev-server.md)
- [Restarts on project changes](project-restarts.md)
- [Rspack extend file](rspack-extend-file.md)
- [Rspack compile](rspack-compile.md)
- [Project model](../architecture/project-model.md)
- [Architecture overview](../architecture/overview.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [SPFx component types](../concepts/spfx-component-types.md)
- [Roadmap overview](../roadmap/overview.md)
- [npm peer conflict with css-loader 7.1.2](../limitations/npm-css-loader-peer-conflict.md): install fails with `ERESOLVE` when the project's `css-loader` is older than 7.1.4

## Evidence

- Source: implementation behavior, ported from the Vite implementation's CLI and options; checked from the packed tarball in copies of two SPFx 1.24.1 test projects (help, version, summary, unknown serve configuration warning, bad port; port in use and SIGINT/SIGTERM shutdown on spfx-rea)
- Confidence: high
- Last checked: 2026-11-19
