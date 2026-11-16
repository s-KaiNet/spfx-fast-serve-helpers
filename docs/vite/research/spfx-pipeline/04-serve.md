# 04 — `heft start` (serve) and how files reach the browser

## Command

`npm start` → `heft start --clean` → alias `build-watch --serve`. Used here: `SPFX_SERVE_TENANT_DOMAIN=mastaq.sharepoint.com npx heft start --nobrowser`.
Watch mode runs the same `build` phase incrementally (TypeScript watch → webpack), and the webpack task uses **webpack-dev-server** instead of a plain compile ([log](artifacts/heft-start.log.txt)).

## Dev server configuration (`updateServeConfigAsync.js`, dump: [webpack-config-serve.json](artifacts/webpack-config-serve.json))

```js
devServer: {
  static: false,
  devMiddleware: { publicPath: '/dist', writeToDisk: true, stats: {...} },
  host: serve.json hostname|ipAddress|'localhost', port: serve.json port|4321,
  hot: true, compress: true, allowedHosts: 'all', historyApiFallback: false,
  client: { overlay: false, webSocketURL: { hostname, port, protocol: 'wss' } },
  open: <initialPage + debug query>  (skipped with --nobrowser),
  setupMiddlewares(m, server) {
    app.use: Access-Control-Allow-Origin: *, -Methods: HEAD, GET, OPTIONS, Access-Control-Allow-Private-Network: true
    app.options('*', cors())
    serve.json "api" routes (optional express handlers from api.entryPath)
    unshift(request logger)      // the " Request: /dist/..." lines in the log
    push express.static(<project root>, {index:false}) mounted at '/'      (contentBase override possible)
    push express.static(<dep>/dist) at '/' for every referenced SPFx package (dependency serve map)
  }
}
server: https with cert from @rushstack/debug-certificate-manager (~/.rushstack/rushstack-serve.pem, CN=localhost,
        SAN localhost/127.0.0.1/::1, CA ~/.rushstack/rushstack-ca.pem) unless devServer.server already set
```

Because the **whole project root** is served, these URLs all respond 200 (curl):
`/temp/build/manifests.js`, `/dist/hello-world-web-part.js`, `/dist/<id>.manifest.json`, `/lib/...js`, `/src/...ts`, `/package.json`, `/node_modules/@microsoft/sp-core-library/dist/...`.

### What is actually served for the bundle

`/dist/hello-world-web-part.js` during serve = **218 KB** vs 50 KB from `heft build`: webpack-dev-server injects
`webpack-dev-server/client/index.js?protocol=wss&hostname=localhost&port=4321&pathname=/ws&…&hot=true&live-reload=true` and `webpack/hot/dev-server.js` into the entry, plus the HMR runtime (`__webpack_require__.hmrF → hello-world-web-part.<hash>.hot-update.json`). With `writeToDisk: true` this file also overwrites `dist/` on disk. Saved copies: [served/](artifacts/served/).

### Debug query string

`ServeInfoPlugin` prints and `SPFxDebugPageUrlUtilities` builds:

```
?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
```

`serve.json` options: `initialPage` (supports `{tenantDomain}` token, filled from env `SPFX_SERVE_TENANT_DOMAIN`), `serveConfigurations.<name>.pageUrl`, `customActions` / `fieldCustomizers` / `formCustomizer` (→ `loadSPFX=true&customActions=<json>`…, `debug` removed for list pages), select with `--serve-config <name>`; `https`, `port`, `hostname`/`ipAddress`, `contentBase`, `api`.

## Live behaviour on the page (observed)

1. First load with the query string → full-screen dialog **"Allow debug scripts?"** ([screenshot](artifacts/01-debug-prompt.png)). After "Load debug scripts", the decision + URL is persisted in `sessionStorage["spfx-debug"] = {"liveReload":false,"manifestsFileUrl":"https://localhost:4321/temp/build/manifests.js","hasLogged3pDebug":false}` (no prompt on later loads in the same tab session).
2. `manifests.js` is loaded **as a script through RequireJS** (initiator type `script`), not fetch.
3. Adding the web part from the toolbox loaded only `hello-world-web-part.js`, `HelloWorldWebPartStrings_en-us.js` and the PNG from localhost; everything else from `res-1.cdn.office.net`.
4. The injected WDS client connected: console `[webpack-dev-server] Server started: Hot Module Replacement enabled, Live Reloading enabled` / `[HMR] Waiting for update signal from WDS...`.
5. Editing `HelloWorld.tsx`: webpack recompiled (56 ms), browser fetched `…hot-update.json` + `…hot-update.js`, then `[HMR] Cannot apply update. Need to do a full reload!` / `Aborted because 654 is not accepted` → **full page reload** (URL kept `&Mode=Edit`), new text rendered. SPFx code has no `module.hot.accept`, so HMR is effectively live-reload.
6. The old gulp-style `livereload` flag still exists in sp-loader (`?livereload=true` → loads `https://localhost:35729/livereload.js`), unused by Heft.

## Browser-side gates observed

| Gate | Symptom | Cause / fix |
|---|---|---|
| **Certificate** | `net::ERR_CERT_AUTHORITY_INVALID`, dialog "Error loading debug manifests." | rushstack CA not trusted by the browser. Real setup: `heft trust-dev-cert`. In this research: Chrome started with `--ignore-certificate-errors` (agent-browser's `--ignore-https-errors` flag did not take effect for this profile launch). |
| **Local Network Access** (Chrome 142+; tested 153 headless) | request to `https://localhost:4321` stuck pending, no response | public→loopback request needs LNA permission (interactive Chrome shows a permission prompt). Research launch used `--disable-features=LocalNetworkAccessChecks` + CDP `Browser.grantPermissions` for `local-network-access`/`loopback-network`. The server already sends `Access-Control-Allow-Private-Network: true`. |
| **CSP** | `blockedReason: "csp"`, `script-src-elem` violation for `https://localhost:4321/temp/build/manifests.js` | SharePoint emits `script-src … 'self' … https://localhost:* http://localhost:* …` **only when the page is requested with the debug query params**; without them localhost is absent ([with](artifacts/network/csp-with-debug-params.txt) / [without](artifacts/network/csp-without-debug-params.txt)). Because `sessionStorage["spfx-debug"]` keeps the manifests URL, opening the page *without* the query string in the same tab still tries to load `manifests.js` and fails with "Error loading debug manifests" ([screenshot](artifacts/04-no-debug-params.png)). Always keep the query string. |

CSP details useful for a Vite dev server: `script-src` includes `'unsafe-eval'`, nonce/hashes (no `'unsafe-inline'`), `https://localhost:*`, `http://localhost:*` (any port, **http allowed**); `worker-src blob: 'self'`; there is **no `connect-src`/`style-src`/`img-src`** directive → WebSocket/HMR/fetch/CSS/images from localhost are not CSP-restricted. Only `localhost` is listed (not `127.0.0.1`).
