# 08 — Method, evidence index, unknowns, reproduction

## Method

1. **Static reading of shipped tooling** in `node_modules` (non‑minified CommonJS with source maps): `@microsoft/spfx-web-build-rig` (heft.json, tsconfig, sass/ts/jest config), `@microsoft/spfx-heft-plugins` (webpack config generator, ManifestPlugin, CumulativeManifestProcessor, externals, serve config, package solution), `@rushstack/heft-webpack5-plugin` (hook semantics, dev-server/cert), `@microsoft/sp-css-loader`.
2. **Builds executed**: `heft build --clean --verbose`, `heft build --clean --production`, `npm run build`, with a temporary `config/spfx-customize-webpack.js` that dumped the final webpack configuration (removed afterwards).
3. **Serve executed**: `SPFX_SERVE_TENANT_DOMAIN=contoso.sharepoint.com npx heft start --nobrowser`; probed with curl.
4. **Shipped runtime loader** (`@microsoft/sp-loader` dist, minified): analysed with **REA** (`rea analyze-javascript-application`, v6.7.0, CLI fallback — REA MCP was not connected in this session). Evidence `ev_b7697c443f388618faaa115e81c4801ad388561798623f613921764bb8963f8e` (input digest `de0713be…aaec05`): 3 JS files parsed, 89 webpack modules, 22 chunks, endpoints/storage keys including `debugManifestsFile`, `debug`, `livereload`, `loader`, `sessionStorage` keys, `new Worker(b,{name:"SP Worker"})`. REA limitations as reported: inert parsing only, graph incomplete, bootstrap never executed. Targeted code was then read from a prettier-formatted copy (`ManifestStore`, `configLoadComponent`, debug handlers, version compare).
5. **Live runtime** on `https://contoso.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx` using the saved `contoso-sharepoint` Chrome profile: first via agent-browser, then a directly launched Chrome 153 headless (`--ignore-certificate-errors --disable-features=LocalNetworkAccessChecks,Translate --remote-debugging-port=9333`) driven by agent-browser over CDP plus small raw CDP scripts (Network/Audits events, `Browser.grantPermissions`). Captured HARs, console, RequireJS state, sessionStorage, CSP headers, screenshots.

## Evidence index (`artifacts/`)

| File | What |
|---|---|
| `heft-build-dev.log.txt`, `build-production.log.txt`, `heft-start.log.txt` | Build/serve logs (verbose dev build incl. task order and timings; serve request log) |
| `webpack-config-{development,production,serve}.json` | Final webpack configs (plugins summarized by class name) |
| `served/hello-world-web-part.serve.js`, `served/manifests.serve.js` | Exactly what the dev server returned |
| `runtime-requirejs-config.json` | Live RequireJS `paths`/`map`/script tags for our component and deps |
| `network/har-0*.requests.json` | Sanitized request lists (no headers/cookies) for: LNA‑blocked attempt, add‑web‑part session, view‑mode load, CSP‑blocked plain URL |
| `network/csp-with-debug-params.txt`, `csp-without-debug-params.txt` | Page CSP in both modes |
| `network/GetClientSideComponents-react-dom-client.json` | Example manifest request/response |
| `01-debug-prompt.png` … `05-viewmode-webpart-from-localhost.png` | Screenshots |

Raw HARs (contain session cookies/tokens) are kept **outside the repo** in `~/.cache/spfx-rea-research/`.

## Checklist status

| Question | Status |
|---|---|
| How does the build pipeline run (tasks, order, tools)? | Answered (01) |
| What exactly does webpack get configured with and emit? | Answered (02) |
| What is the manifest/loader contract? | Answered (03, 05) |
| How does serve work and which URLs are served? | Answered (04) |
| How does the browser/SharePoint load the files? | Answered for web parts on modern pages in debug mode and inferred for production (05, 06) |
| Production loading from ClientSideAssets | Partially — inferred from other deployed solutions' manifests; this solution not deployed |
| Extensions (application customizers, command sets), Teams/Viva hosts, isolated web parts | Not investigated (code paths noted only) |
| Localization with multiple locales (`localizedPath`) | Partially — code read, not built with >1 locale |
| Vite feasibility | Partially — ESM import probe succeeded; AMD shim + loader-plugin approach not yet built |

## Unknowns / caveats

- Tenant runtime was SPFx 1.25.0 while the local `sp-loader` read statically is 1.24.1; live behaviour matched, but minified internals may differ in detail.
- Whether anonymous `define()` works end-to-end, and whether React Fast Refresh can work with SharePoint's React bundle — untested.
- Whether `http://localhost` (no TLS) works for debug in Chrome — CSP allows it; mixed-content treatment of localhost not tested.
- Which of the two Chrome flags (cert vs LNA) was strictly needed in the final run: the cert error was proven via CDP (`ERR_CERT_AUTHORITY_INVALID`); LNA behaviour in interactive Chrome (prompt) was not observed.
- `GetClientSideComponents` server logic and `__spfxPreloadedModules` server preloading are opaque.

## Reproduce

```bash
npx heft build --clean --verbose                     # dev build → dist/, temp/build/manifests.js
npm run build                                        # prod + sppkg
SPFX_SERVE_TENANT_DOMAIN=contoso.sharepoint.com npx heft start --nobrowser
# open (trusted cert, LNA allowed):
# https://contoso.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
# in devtools console:
#   require.s.contexts._.config.map["2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1"]
#   require.s.contexts._.config.paths["2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1"]
#   sessionStorage.getItem("spfx-debug")
```

To dump the webpack config again, temporarily add `config/spfx-customize-webpack.js` exporting `(config) => fs.writeFileSync(..., JSON.stringify(config, replacer))`.
