---
title: Dev server, debug manifests and debug URL
type: feature
status: current
tags:
  - project-kb
  - dev-server
  - manifests
  - https
  - debugging
---

# Dev server, debug manifests and debug URL

## Summary

`fast-serve` runs `@rspack/dev-server` over HTTPS on `localhost:<port>` with the SPFx development certificate. It serves the [compiled AMD bundles](rspack-compile.md) from memory under `/dist/`, its own debug `manifests.js` at `/temp/build/manifests.js` (heft's path) and the relative icon files the manifests reference, nothing else from the project. Every response carries CORS and Private Network Access headers. After the first compile it prints a ready banner with the components and the SharePoint page URL plus the debug query for the chosen port. SIGINT/SIGTERM stop the server and the compiler cleanly. With `TunnelServePlugin` the public origin becomes the tunnel host while the server keeps listening on `localhost` ([tunnel mode](tunnel-mode.md)). On spfx-rea, both web parts and the Banner customizer render on a real SharePoint page with three requests to the dev server per page load.

## Behavior

### Server

| Aspect | Behaviour |
|---|---|
| Address | `https://localhost:<port>` (Node binds `localhost` to the loopback address it resolves first); the port comes from the [options](cli-and-options.md) |
| Certificate | the SPFx dev certificate through `@rushstack/debug-certificate-manager`, like heft (`ensureCertificateAsync` without creating one); missing or incomplete → `Run "npx heft trust-dev-cert"` |
| Port taken | checked on `127.0.0.1` and `::1` before anything starts; see [Port in use at start](#port-in-use-at-start) |
| Bundles | Rspack output kept in memory, served under `/dist/` (`publicPath` is the absolute `https://localhost:<port>/dist/`); nothing is written to disk |
| `manifests.js` | `GET`/`HEAD /temp/build/manifests.js`, rendered on each request, `Cache-Control: no-store`; waits for the first compile |
| Icons | relative manifest icons (`./…`, `../…`) are served from their source files at their project-relative path, only image types; everything else in the project returns 404 |
| Headers | `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: HEAD, GET, POST, OPTIONS`, `Access-Control-Allow-Headers: *`, `Access-Control-Allow-Private-Network: true` on every response; `OPTIONS` answers 204 with the same headers; hot-update files (`*.hot-update.json`, `*.hot-update.js`) also get `Cache-Control: no-store` |
| Hosts | `allowedHosts: 'all'` like heft: the dev server otherwise rejects SharePoint's cross-site `no-cors` script requests and websocket connections from the tenant origin |
| Compression | off (local traffic) |
| Websocket client | added by the dev server to every bundle; connects to `wss://localhost:<port>/ws`; browser logging `warn`; its own overlay is off (fast-serve draws one overlay per page, see [Errors, overlay and terminal output](errors-and-diagnostics.md)) |
| Browser errors | `POST /fast-serve/browser-errors` receives error reports from the page runtime and answers with overlay content or a readable load-error message |
| heft package files | `GET /dist/<Name>_<locale>.js` answers a strings script of a heft development package as an AMD module, `GET /dist/<name>_<md5>.<ext>` a content-hashed local-file external (used by [tunnel mode](tunnel-mode.md)) |
| HMR | `hot` and `liveReload` on: edits hot-update inside the bundles with React Fast Refresh, an update that nobody accepts falls back to a page reload; details in [HMR and React Fast Refresh](hmr.md) |
| Terminal | one line per compile (`compiled in … ms` / `rebuilt in … ms (<changed files>)`, error and warning counts only when non-zero; nothing for rebuilds that change no module output and no problem), errors and warnings with project-relative paths; the dev server's own banners and stats are silenced ([details](errors-and-diagnostics.md#terminal)) |

### Debug `manifests.js`

fast-serve's page runtime (error forwarding, overlay, readable load errors; see [Errors, overlay and terminal output](errors-and-diagnostics.md)) as a guarded script, then an anonymous AMD module, `define([], function () { … return { getManifests: function () { return manifests; } }; })`, with one entry per component of every bundle:

- the source manifest (JSON with comments, `"version": "*"` replaced by the `package.json` version), relative icon URLs made absolute on the dev server;
- `loaderConfig.internalModuleBaseUrls`: `["https://localhost:<port>/dist/"]`, rendered for the port the server listens on (heft 1.24.1 writes 4321 into its file even when `serve.json` sets another port);
- `loaderConfig.entryModuleId`: the bundle name; `exportName` for components of multi-component bundles;
- `loaderConfig.scriptResources`: the bundle (`{ type: 'path', path: '<bundle>.js' }`), then one `{ type: 'component', id, version }` per SPFx library the bundle really uses (the external modules of the bundle's chunks, including its async chunks, after each successful compile), then `@microsoft/sp-loader`, then the `config.json` externals the bundle imports and their global dependencies (`{ type: 'path', path, globalName?, globalDependencies? }`; a local file as the relative `<name>.js`, served under `/dist/`). All components of a bundle share the same list, like heft. See [SPFx libraries and config.json externals](libraries-and-externals.md).

Differences from heft's file: no localized-resource or React entries (both are bundled, see [Rspack compile](rspack-compile.md)); heft's file is a webpack-built script, ours is a plain AMD module rendered from the [project model](../architecture/project-model.md) and the compile facts.

### Debug URL and ready banner

The banner prints `ready in <ms> ms at https://localhost:<port>`, the web parts, extensions (with their kind) and ACEs, the serve configuration, then either `open: <page>?<debug query>` or, without a resolved page, the hint to set `SPFX_SERVE_TENANT_DOMAIN` and the query to append. The query replaces the page's own query and keeps its `#hash`: `debugManifestsFile=https://localhost:<port>/temp/build/manifests.js&debug=true&noredir=true`; a serve configuration with extensions switches to heft's form (`loadSPFX=true`, `customActions` / `fieldCustomizers` / form customizer parameters, no `debug=true`, see [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)). With ACEs in the project, a line about adding and using them on the page follows, plus the plain web-part debug query when the opened URL carries the extension query ([Extensions and ACEs](extensions-and-aces.md#adaptive-card-extensions)). A last line reminds that the debug query sticks to the browser tab.

### Shutdown

SIGINT and SIGTERM stop the dev server (websocket clients, sockets, middleware and watcher) and close the compiler, then exit 0; a second signal while closing is ignored. The dev server's own exit-signal handling is off so the two don't race.

### Measured (spfx-rea, SPFx 1.24.1)

Start to ready: about 1.2 s uncached and 0.6 s with the persistent cache (process start → ready line, [details](performance-and-cache.md)). A page load requests `manifests.js`, the one bundle on the page (1.3 MB, development React included) and one image: three requests. A text edit in a component rebuilds in about 40 ms and reaches the DOM in about 120–160 ms without a reload ([HMR](hmr.md)).

### Port in use at start

- **Interactive terminal** (stdin and stdout are TTYs): fast-serve finds the listening process and prints `Port <n> is in use by <name> (pid <pid>): <command line, shortened to 120 characters, executable as its base name>`, then `Press Enter to stop it and continue, or Ctrl+C to cancel.` The key is read in raw mode (Enter = CR or LF; Ctrl+C, Ctrl+D or end of input = cancel); raw mode, listeners and the paused state of stdin are restored afterwards, so Ctrl+C stops the server normally later.
- **Enter:** SIGTERM (Windows: `taskkill /PID`), then waits up to 3 s for the port; still busy, or the gentle stop failed → SIGKILL (`taskkill /F /PID`) and up to 5 s more. Freed → `stopped <name> (pid <pid>), port <n> is free` and a normal start. Stop refused (EPERM: another user) or port still busy → the in-use error with the reason and the owner, exit 1.
- **Cancel:** `Cancelled: port <n> is still in use by <name> (pid <pid>), nothing was stopped.`, exit 1.
- **Not offered:** owner not identified → `The process holding the port could not be identified. Port <n> is already in use …`; owner is fast-serve's own process or its parent → the in-use error with the owner. Exit 1 in both cases.
- **No interactive terminal** (CI, agents, piped output): no lookup, no prompt, nothing stopped: `Port <n> is already in use (another fast-serve or "heft start" may be running). Stop it, or choose another port: fast-serve --port <n+1>, or "port" in fast-serve/config.json.`, exit 1.
- **Restarts** inside a session never ask; a busy port there is a failed restart as before.
- **Finding the owner** (no dependency, child processes without a shell, 3 s timeout each): Windows `netstat -ano` (TCP rows for the port that are `LISTENING` or have a wildcard foreign port `:0`, which also covers localized state names) and `tasklist /FI "PID eq <pid>" /FO CSV /NH` for the image name (no command line: PowerShell/CIM is too slow); macOS/Linux `lsof -nP -iTCP:<port> -sTCP:LISTEN -Fpcn`, on Linux falling back to `ss -ltnpH` when lsof is missing or sees nothing, then `ps -o args= -p <pid>` for the command line (the name is the executable's base name, because Node 24 reports its main thread as `MainThread` to lsof and ss). Neither lsof nor ss shows other users' processes without root.
- No option or flag controls this.

## Links

- [Startup performance and the persistent cache](performance-and-cache.md)
- [Rspack compile](rspack-compile.md)
- [HMR and React Fast Refresh](hmr.md)
- [CLI, options and startup](cli-and-options.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Project model](../architecture/project-model.md)
- [Rspack facts and references](../references/rspack.md)
- [SPFx 1.24 Heft pipeline](../references/spfx-heft-pipeline.md)

## Evidence

- Source: implementation behaviour; integration test with a real dev server on a fixture project (manifest module evaluated in a fake `define`, bundle, preflight, icon, 404s, port taken and released); live check on a copy of spfx-rea from the packed tarball on a SharePoint Online page (HelloWorld and Second web parts and the Banner customizer rendered, theme primary colour applied to the web part's links, no console errors from fast-serve's bundles, three dev-server requests per load, edit → rebuild → reload, clean SIGINT/SIGTERM exit); heft's dev-server settings read from `@microsoft/spfx-heft-plugins` (CORS headers, `allowedHosts: 'all'`); `@rspack/dev-server` 2.2.2 sources for the host checks and listen behaviour
- Confidence: high
- Last checked: 2026-11-19
- Port in use at start (`1.24.0-beta.13`): user decision to ask instead of stopping silently (classic spfx-fast-serve freed the port unconditionally with the `kill-port` package), with no option and no dependency; parsers tested on recorded `netstat` (English and German), `tasklist`, `lsof` and `ss` output; integration test on Linux with a listener child process (Enter → SIGTERM and the port can be bound, Ctrl+C → child alive, no TTY → no prompt, ss fallback); real CLI in a pseudo-terminal on a copy of spfx-rea: Enter stopped a dummy listener and the server was ready in about 0.9 s after the prompt, Ctrl+C and Ctrl+D exited 1 with the listener alive, Ctrl+C after the prompt still stopped the running server, piped stdin gave the unchanged error, no `lsof`/`ss`/`ps` on PATH gave the "could not be identified" error
