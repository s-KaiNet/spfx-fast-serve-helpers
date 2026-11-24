# SPFx build pipeline & browser loading — reverse-engineering report

Project: `spfx-rea` (SPFx **1.24.1**, Heft-based toolchain, React 18 web part `HelloWorld`).
Tenant under test: `https://contoso.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx` (tenant runtime was serving SPFx **1.25.0**).
Date of investigation: 2026‑11‑12/13. Goal: understand the build + serve + runtime contract well enough to replace webpack with **Vite**.

## TL;DR

1. **Build** = `heft` + the rig `@microsoft/spfx-web-build-rig`. Phase `build` runs: `sass` → `typescript` (src → `lib/` ESM + `lib-commonjs/`) → `webpack` (bundles **`lib/*.js`, not `src/`**) + `lint`. Webpack's config is *generated in memory* by `@microsoft/spfx-heft-plugins` from `config/config.json`. → [01-build-pipeline.md](01-build-pipeline.md)
2. **Bundle format** = one **named AMD module** per bundle: `define("<componentId>_<version>", [<bare specifiers>], factory)`. Everything that is an SPFx component (all `@microsoft/sp-*`, `react`, `react-dom`, `react-dom/client`, graph client) and every `localizedResources` key is a webpack **external**. The module's **default export is the web part class**. → [02-webpack-config.md](02-webpack-config.md)
3. **Manifest** (`dist/<id>.manifest.json`) is the real contract: `loaderConfig.internalModuleBaseUrls` + `entryModuleId` + `scriptResources` (each bare specifier → `{type:"component", id, version}` or `{type:"path", path}` / `localizedPath`). Dev manifests point at `https://localhost:4321/dist/`, release manifests at the CDN placeholder. `temp/build/manifests.js` is an AMD file that returns *all* debug manifests. → [03-manifests.md](03-manifests.md)
4. **Serve** (`heft start`) = webpack‑dev‑server on `https://localhost:4321` with a rushstack dev cert, CORS `*`, static serving of the **whole project root** (`/temp/build/manifests.js`, `/dist/*`, `/node_modules/...`), HMR client injected, `writeToDisk:true`. HMR updates are **not accepted** by SPFx code → full page reload. → [04-serve.md](04-serve.md)
5. **Runtime**: page HTML inlines `spClientSidePageContext` (incl. preloaded manifests) → loads `sp-pages-assembly` (contains sp-loader) → sp-loader creates **RequireJS 2.3.7** from an embedded string (blob: URL). With `?debugManifestsFile=…&debug=true&noredir=true` the loader shows an "Allow debug scripts?" prompt, loads `manifests.js` via RequireJS, **drops manifests of internal/framework components**, registers the rest as *debug manifests* (they win version resolution). To load a component it translates the manifest to RequireJS config: `paths["<id>_<ver>"] = baseUrl+path(without .js)`, `map["<id>_<ver>"] = { "react": "0d910c1c…_18.3.1", … }`, then `require(["<id>_<ver>"])`. Framework deps resolve to **whatever the page has** (1.24.1 requested → 1.25.0 used: same major, ≥ requested). → [05-runtime-loader.md](05-runtime-loader.md)
6. **Security gates observed live**: SharePoint adds `https://localhost:* http://localhost:*` to `script-src` CSP **only when debug query params are present**; Chrome 153 needs the dev cert trusted and (headless) Local‑Network‑Access relaxed. → [04-serve.md](04-serve.md#browser-side-gates-observed)
7. **Packaging**: `package-solution` zips `release/manifests` + `release/assets` into `sharepoint/solution/spfx-rea.sppkg`; `internalModuleBaseUrls` becomes `HTTPS://SPCLIENTSIDEASSETLIBRARY/`, which SharePoint rewrites to `/sites/appcatalog/ClientSideAssets/<solutionId>/` (observed on other deployed solutions in this tenant). → [06-packaging-deployment.md](06-packaging-deployment.md)
8. **Vite**: a native ES module imported from `https://localhost:*` inside the SharePoint page works (CSP+CORS OK) and can synchronously reach SPFx‑loaded AMD modules through `window.require("<id>_<ver>")`. Contract + options for a Vite builder → [07-vite-integration-notes.md](07-vite-integration-notes.md)

## Documents

| File | Content |
|---|---|
| [01-build-pipeline.md](01-build-pipeline.md) | Heft phases/tasks, rig, task graph, folders & outputs, timings |
| [02-webpack-config.md](02-webpack-config.md) | Generated webpack config (dev/prod/serve), externals, AMD output, loaders, CSS, assets, localization, customization hooks |
| [03-manifests.md](03-manifests.md) | Component manifest schema as emitted, debug vs release, `manifests.js`, dependency discovery, audit file |
| [04-serve.md](04-serve.md) | `heft start` / webpack‑dev‑server, served URLs, certificate, HMR, query string, CSP & LNA |
| [05-runtime-loader.md](05-runtime-loader.md) | Page bootstrap, sp-loader debug flow, manifest store & version resolution, RequireJS config, web part instantiation, timeline |
| [06-packaging-deployment.md](06-packaging-deployment.md) | `.sppkg` structure, ClientSideAssets, production URL resolution |
| [07-vite-integration-notes.md](07-vite-integration-notes.md) | The contract a replacement builder must satisfy, design options, experiment results, risks |
| [08-evidence-and-method.md](08-evidence-and-method.md) | Method, tools (REA, agent-browser, CDP), evidence index, unknowns, how to reproduce |
| [artifacts/](artifacts/) | Logs, generated webpack config dumps, served files, sanitized network extracts, RequireJS snapshot, screenshots |

## Finding ledger (short)

Legend: **O** = observed (ran it / saw it live), **S** = read in shipped code (static), **I** = inference.

| # | Finding | Evidence | Type |
|---|---|---|---|
| F1 | Webpack bundles `lib/**/*.js` (TS output), not `src` | `webpack-config-*.json` entry, `config/config.json` | O+S |
| F2 | Output is named AMD `define("<id>_<ver>", deps, f)`; `libraryTarget: amd`, `uniqueName = <id>_<ver>` | `dist/hello-world-web-part.js` line 1; `WebpackConfigurationGenerator.js` | O+S |
| F3 | Externals = all packages with SPFx manifests in node_modules + react/react-dom/react-dom/client/graph-client + `localizedResources` keys + `config.json externals` | `webpack-config-development.json`; `ExternalsProcessor.js`, `LegacyExternals.js` | O+S |
| F4 | Manifest `scriptResources` map bare specifiers → component id/version or path | `dist/*.manifest.json`; `ManifestPlugin.js` | O+S |
| F5 | `manifests.js` = AMD module returning all debug manifests (own + every SPFx package in node_modules) | `temp/build/manifests.js`; `CumulativeManifestProcessor.js` | O+S |
| F6 | Dev server serves project root statically; CORS `*`; `Access-Control-Allow-Private-Network: true`; HMR+live-reload client injected; `writeToDisk:true` | curl headers; `updateServeConfigAsync.js`; served bundle | O+S |
| F7 | sp-loader ignores debug manifests for components that are internal on the page → framework always from SharePoint CDN | live network (no localhost sp-* requests); `sp-loader-debug-handlers` chunk code | O+S |
| F8 | Version resolution: same major, ≥ requested, debug manifests preferred | runtime map `sp-core-library → 1.25.0`; `ManifestStore.getManifest` | O+S |
| F9 | Loader → RequireJS `paths`/`map` config; module id `<id>_<ver>`; non-entry path resources get id `<id>_<ver>/<name>` | `runtime-requirejs-config.json`; `configLoadComponent` code | O+S |
| F10 | Web part class = `module.default` (unwrapped up to twice) | sp-webpart-base `_initializeWebPart` | S |
| F11 | CSP allows `localhost:*` (http+https) only when debug params present; otherwise script blocked (`blockedReason: csp`) | `network/csp-*.txt`, CDP `loadingFailed` | O |
| F12 | Debug manifests URL is remembered in `sessionStorage["spfx-debug"]` → loader retries it even without query params (and then hits CSP) | `sessionStorage` dump; plain-URL load | O |
| F13 | HMR update fails (`Aborted because 654 is not accepted`) → full reload; page keeps `Mode=Edit` | console log + navigation | O |
| F14 | ESM `import()` from `https://localhost:*` works in a debug page; ESM can call `window.require("<id>_<ver>")` | eval result `esm-ok:dep-ok:function:true react=18.3.1` | O |
| F15 | Deployed solutions use `https://<tenant>/sites/appcatalog/ClientSideAssets/<solutionId>` as base URL | `_api/web/GetClientSideWebParts` | O |

## State left behind

- Page `SitePages/spfx-rea.aspx` now contains the **HelloWorld** web part, **saved as a draft** (not published). It renders only when the page is opened with the debug query string and `heft start` is running.
- `dist/` currently contains the **serve-mode** bundle (with HMR client, written by `writeToDisk`). Run `npm run build` to regenerate production output.
- The temporary webpack dump hook (`config/spfx-customize-webpack.js`) and probe ESM files were removed. Raw HAR files (contain auth cookies) were moved **outside the repo** to `~/.cache/spfx-rea-research/` (mode 700); only sanitized extracts live in `artifacts/network/`.
