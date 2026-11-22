---
title: Tunnel mode (TunnelServePlugin)
type: feature
status: current
tags:
  - project-kb
  - tunnel
  - mobile
  - dev-server
---

# Tunnel mode (TunnelServePlugin)

## Summary

`new TunnelServePlugin({ host })` in the [Rspack extend file](rspack-extend-file.md) switches `fast-serve` to the classic fast-serve tunnel flow (helpers ≤ 1.21 called it `NgrokServePlugin`): the developer runs a tunnel with a fixed host to `https://localhost:<port>`, builds a heft **development** package with `config/serve.json` `hostname: <host>`, `port: 443`, deploys it to the app catalog, and SharePoint (desktop, Viva Connections or Teams mobile) loads the bundles from the tunnel without a debug query. `fast-serve` keeps listening on `localhost` and uses `https://<host>` as the public origin everywhere the page sees a URL. It never starts or manages a tunnel.

## Current Knowledge

### Why a deployed package

- SharePoint's loader accepts `debugManifestsFile` (and `loader`/`moduleLoader`) only on `localhost`/`127.0.0.1` for third parties, and the CSP allows `localhost:*` scripts only together with the debug query ([SharePoint debug flow](../concepts/sharepoint-debug-flow.md)). A tunnel URL in the debug query doesn't work, so the page must use deployed manifests whose `internalModuleBaseUrls` point at the tunnel.
- heft's non-production build writes `https://<hostname>:<port>/dist/` from `config/serve.json` into `dist/*.manifest.json`, and `heft package-solution` without `--production` packs those manifests. Entry file names, export names (`a`, `b`, …) and the async chunk names match `fast-serve`'s bundles.

### How the plugin is recognised

- The plugin is a marker, not a working Rspack plugin: its `apply` does nothing. The session reads the extend file's merged config, takes the first plugin carrying the global symbol `Symbol.for('spfx-fast-serve.tunnel-serve-plugin')` (so a second copy of the package still matches), removes every such plugin from `plugins` and sets a resolved option "tunnel host". Output and dev-server keys stay guarded; the guard messages for `output.publicPath` and `devServer.client` point to the plugin.
- `host` must be a host name only (lower-cased, trimmed). A scheme, port, path, spaces or a missing value print a warning naming the extend file and leave tunnel mode off. Several plugins: the first wins, with a warning.
- The extend-file context is computed before the file runs, so its `origin`/`publicPath` stay `https://localhost:<port>`. Removing the plugin restarts the session ([restarts](project-restarts.md)) and goes back to localhost.

### What changes in tunnel mode

| Place | Normal | Tunnel mode |
|---|---|---|
| public origin (`output.publicPath`, chunk, asset and hot-update URLs, `manifests.js` base URLs and icon URLs, page-runtime report URL, local-file externals) | `https://localhost:<port>` | `https://<host>` |
| HMR websocket in each bundle's dev-server client | `wss://localhost:<port>/ws` | `wss://<host>:443/ws` |
| listen address, certificate, port check | `localhost:<port>`, SPFx dev certificate | unchanged (the tunnel terminates public TLS and talks to the dev certificate without verifying it) |
| `Cache-Control` | `no-store` on `manifests.js`, hot-update files and served helper files | also `no-store` on every `/dist/` file |
| extra bundle entry | – | a script that deletes the tunnel host's responses from SharePoint's `Site-*` Cache Storage (the Viva/Teams mobile apps cache script responses), like classic fast-serve's cache clearing |
| banner | ready line and debug-query box | ready line with the tunnel origin and the local origin the tunnel must forward to, then one line: open the page without the debug query, the deployed development package loads the bundles from the tunnel; no box, because localhost debug-query scripts would come from the tunnel host |

CORS (`*`) and Private Network Access headers are unchanged; through a public tunnel the page origin is public, so no local-network prompt appears.

### Files heft's development package asks for

- **Strings:** heft lists each `localizedResources` name as its own script resource. One locale → `{ "type": "path", "path": "<Name>_<locale>.js" }`; several → `localizedPath` with `defaultPath` and per-locale `paths` (plus heft's locale remapping). The locale is the one matched in the loc file path; production builds append `_<md5>`. `fast-serve` answers `GET /dist/<Name>_<locale>.js` for every `localizedResources` name of the project and linked library projects (including library strings such as `ControlStrings`) with a small AMD module `define([], function () { return { … }; })` holding that locale's strings. The loc file (AMD, ES module, CommonJS or TypeScript) is transpiled to CommonJS and evaluated in a sandbox without `require`; a locale without a file answers 404. The bundles still carry their own copy of the strings, so string edits keep hot-updating; the separate script only has to load.
- **Local-file `config.json` externals:** heft's non-serve builds name them `<name>_<md5 of the content>.<ext>`; `fast-serve` answers those names with the file (served as `<name>.<ext>` otherwise).
- Bundles and async chunks need no mapping.

### Page runtime inside the bundles

The page runtime (error forwarding, the overlay with compile, runtime and type errors, readable load errors; [Errors, overlay and terminal output](errors-and-diagnostics.md)) is the first module of every bundle, in both modes, before the dev-server client and the refresh entry. It guards itself with a page-wide symbol per origin, so it runs once per page however many bundles load. `manifests.js` keeps the same runtime at its top for the debug-query flow: there it installs first, the bundle copies do nothing, and load errors of a bundle that never evaluates (script error, missing external) stay readable. A deployed package never loads `manifests.js`, so in tunnel mode the bundle copy is the one that runs, and a bundle that fails to load at all is only reported by SharePoint. Type errors come over the type check's event stream at `https://<host>/fast-serve/type-check` (in the runtime config of every bundle), sent with `Cache-Control: no-cache, no-store, no-transform` and `X-Accel-Buffering: no` so buffering proxies pass events at once ([Background type check](type-checking.md)).

### Known gaps

- heft's manifests, not `fast-serve`'s, decide what SharePoint loads. Rspack hoists an SPFx library used only in an async chunk onto the entry `define` (an ACE's property-pane chunk importing `@microsoft/sp-property-pane`), while heft loads it asynchronously and doesn't list it in the ACE manifest. Whether SharePoint resolves the unlisted library is not verified on a tenant.
- Manifest changes (new component, new SPFx library or external, changed `config/config.json`) and a new tunnel host need a new heft development package and a redeploy; code edits don't.

### Risks to tell users

- Free ngrok endpoints put a warning page in front of browser `GET` requests, decided by the User-Agent; `<script>` tags can't send the bypass header, so bundles load HTML; the same warning page could answer the type check's event stream (`EventSource` can't send headers), not verified. Use a paid ngrok plan, Microsoft Dev Tunnels (script requests without `text/html` in `Accept` skip its warning page; anonymous access needed) or a named Cloudflare tunnel. Cloudflare quick tunnels work but change the host on every start.
- The dev server, its source maps and the browser-errors endpoint are public while the tunnel runs; never deploy the development package to a production catalog. It replaces the deployed app with the same id and needs app-catalog rights; a host SharePoint blocks may need to be added to trusted script sources (exact host).

## Links

- [Rspack extend file](rspack-extend-file.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [Errors, overlay and terminal output](errors-and-diagnostics.md)
- [Localized strings](localization.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)

## Evidence

- Source (2026-11-20, `1.24.0-rspack.19`, local end to end, no tenant deployment): spfx-rea copy, Cloudflare quick tunnel to `https://localhost:4450`, `config/serve.json` `hostname: <quick-tunnel host>`, `port: 443`, `heft build` (development): manifests list `https://<host>:443/dist/`, strings as `<Name>_en-us.js`, local externals none. All 9 script URLs of the 7 manifests (5 bundles, 4 strings files) answered 200 through the tunnel with `no-store` and CORS `*` (85–313 ms); the strings modules equal heft's files; every bundle's `define` dependencies are listed in heft's manifest except `@microsoft/sp-property-pane` on the ACE; bundles contain the tunnel public path, `hostname=<host>&port=443`, one page runtime and the cache script, no `localhost`. The lazy chunk `chunk.Hello-property-pane.js` loaded (200). HMR websocket through the tunnel with a SharePoint `Origin`: `hot`/`liveReload`/`hash`/`ok`; an edit of a component arrived as `invalid` → `hash` → `ok` 154 ms after the save, and its hot-update manifest loaded through the tunnel with `no-store`. `heft package-solution` (development) packed the tunnel base URL and the strings paths.
- Source: heft 1.24.1 legacy-externals and localized-manifest code read for the strings and local-external file names; classic helpers' `NgrokServePlugin` and cache-clearing script read from history.
- Source (same day, live, normal flow on a SharePoint page with the debug query): both web parts render, the page runtime installs once, an error thrown in an `onClick` opens one overlay and is printed once in the terminal, the fix closes it; a module throwing at load opens the load-error overlay and the readable message in both web part boxes, and the page reloads and renders after the fix.
- Source (2026-11-23, `1.24.0-beta.21`, local, no tunnel): tunnel-mode run with a fake host; every bundle carries the page runtime once with the tunnel-origin event-stream URL; the stream requested with the tunnel `Host` header streamed the planted type error and the clean result; integration test with a bundles-only fake page shows the type error in the overlay. Not yet checked through a real tunnel.
- Last checked: 2026-11-23 (`1.24.0-beta.21`)
