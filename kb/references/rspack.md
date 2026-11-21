---
title: Rspack facts and references
type: reference
status: current
tags:
  - project-kb
  - reference
  - rspack
  - hmr
  - dependencies
---

# Rspack facts and references

## Summary

Versions, Rspack 2 behaviours and prototype findings the Rspack implementation relies on, plus the prototype's numbers against heft and the Vite implementation.

## Current Knowledge

### Versions (2026-11-19)

| Package | Version | Role |
|---|---|---|
| `@rspack/core` | 2.3.3 | compiler, `builtin:swc-loader`, `DefinePlugin`, HMR runtime |
| `@rspack/dev-server` | 2.2.2 | HTTPS dev server, websocket, client overlay; built on `connect-next`, not Express; `selfsigned` peer is optional |
| `@rspack/plugin-react-refresh` | 2.0.3 | React Fast Refresh (peer `react-refresh` ≥ 0.10 < 1) |
| `react-refresh` | 0.19.0 | refresh runtime |
| `sass-loader` | 17.1.0 | Sass in Rspack; `sass`/`sass-embedded` are optional peers, so the project's Sass implementation is passed in |

All Rspack 2 packages are pure ESM.

### Rspack 2 behaviours that matter

- `output.hashFunction: 'md5'` panics on the Rust side; use `xxhash64` (or `md4`, `sha256`).
- `output.libraryTarget` is ignored; use `output.library.type: 'amd'`.
- AMD externals need `externalsType: 'amd'`; otherwise externals are emitted as `module.exports = <name>` with an empty dependency list.
- AMD parsing (`define`, `require([...])`, UMD AMD branches) is **off unless `amd` is set** in the config (webpack enables it by default); `amd: {}` restores webpack's behaviour.
- CSS is not handled without explicit rules (`experiments.css` is deprecated), so JavaScript CSS loaders need no `type` workarounds beyond `javascript/auto`.
- A hot update re-adds a module that left the chunk during a failed build (a module with a build error has no dependencies). For an AMD external that means a factory referring to the `define` parameter, which only exists in the original bundle's closure. The update manifest lists no removed modules in that case, so the original factory is still in `__webpack_require__.m` and can be put back in the hot-update handler (`globalObject[hotUpdateGlobal](chunkId, moreModules, runtime)`).
- Watchpack (the default, non-native watcher) matches a `RegExp` in `watchOptions.ignored` against the path with backslashes replaced by `/`.
- Externals used only inside `import()` chunks of an AMD library are hoisted onto the entry `define` dependency list.
- Virtual modules: `rspack.experiments.VirtualModulesPlugin` (experimental) serves generated modules under real-looking paths without writing files.
- `module.parser.javascript.exportsPresence` defaults to `error` (webpack 5 warns); heft only filters "export … was not found" warnings, so `auto` plus a warning filter matches heft.
- Under `auto`, a missing export reports `ESModulesLinkingWarning: export 'X' (reexported as 'X') was not found in './y'` (or `imported as`); a missing import used only in `typeof X` reports nothing. The warning object carries `module` (the importer); `compilation.moduleGraph.getOutgoingConnections(module)` matched by `dependency.request` gives the target module, and `module.nameForCondition()` its file path. `compilation.hooks.processWarnings` filters warnings; `compilation.errors` can be replaced in `afterSeal` to reword errors.
- `module.rules[].resolve.tsConfig` (`{ configFile }`) applies tsconfig `paths`/`baseUrl` only to requests issued by the matched modules and follows `extends` chains whose `include` lives in the extended file.
- `builtin:swc-loader` options: `jsc.transform.legacyDecorator`, `decoratorMetadata`, `decoratorVersion` (`2022-03` for TypeScript 5 standard decorators), `useDefineForClassFields`. JavaScript loaders receive functions in `options` unchanged (used for `sp-css-loader`'s class-name function and fast-serve's own checks); a loader with `enforce: 'post'` sees SWC's JavaScript output.
- A package whose `package.json` has `"type": "module"` makes its `.js` files strict ESM, so extensionless relative imports in them fail as "fully specified" (matters for scratch projects inside such a package).
- webpack plugins that use webpack-only hooks don't run: `Compilation.hooks.afterOptimizeChunkModules`, `JavascriptModulesPlugin.getCompilationHooks().render`. A `webpack.DefinePlugin` instance must be replaced by `rspack.DefinePlugin`. JavaScript loaders (`sass-loader`, `@microsoft/sp-css-loader`, `html-loader`) run unchanged.
- Rspack's `ExternalModule` has `userRequest` but no `externalType` (matters only when reading modules from stats/plugins). `compilation.chunkGraph.getChunkModules(chunk)` plus `instanceof ExternalModule` over an entrypoint's chunks and their `getAllAsyncChunks()` gives the externals a bundle uses.
- A hot update cannot add an AMD external: the module that reads it refers to a factory parameter of the bundle's `define` that doesn't exist, and the update throws "`__rspack_external_<name>` is not defined" (React Refresh swallows it into a broken component, no automatic reload). Detect external-list changes on `done` and reload instead.
- `compilation.hooks.finishModules` gives the modules; `NormalModule` exposes `resource` and `rawRequest` (the request as written), enough to find files bundled from a given package.
- The dev server's `sendMessage(webSocketServer.clients, 'static-changed')` makes every connected client reload the page; a `done` tap registered by a plugin runs before the dev server's own, so the reload is sent before the update is announced.
- Two `rspack.experiments.VirtualModulesPlugin` instances in one compilation work side by side.
- ES module output for Node (`output.module: true`, `library.type: 'module'`, `chunkFormat: 'module'`, `target: 'node22'`) needs no experiment flag in Rspack 2 (`experiments.outputModule` no longer exists). An externals function can choose the type per request: `node-commonjs <request>` (via `createRequire`) for `require()` and `module <request>` (static `import`) for `import`. `import.meta.url` in bundled modules is replaced with the source file's URL; `node.__dirname: 'node-module'` gives the output file's folder, not the source's.
- A strict ES module (`.mjs`) that re-exports a missing name (`export { default } from …`) is a linking error (`ESModulesLinkingError`) even with `exportsPresence: 'auto'`; re-exporting the namespace avoids it. A CommonJS module imported as a namespace from strict ESM gives `{ default: module.exports }`.
- A failed compile still emits its output file; the caller must delete it.

- Persistent cache (`cache: { type: 'persistent', version, storage: { type: 'filesystem', directory } }`): one cache per compiler path, overwritten when `version` differs; no build dependencies by default (unlike webpack), so configuration changes must be reflected in `version` or `buildDependencies`; `node_modules` files are validated by package version (managed paths). A cached start reports a module's syntax error like an uncached one (checked). `output.hashSalt` changes do not invalidate it.
- `incremental` is fully enabled in development by default (every pass), `lazyCompilation` is off by default and its client posts to the dev server (`/_rspack/lazy/trigger`).
- sass-loader's `implementation` and `sassOptions` are read per loader run (`sassOptions` may be a function), so the Sass package can be loaded on first use; Rspack passes JavaScript loader option objects by reference, getters included.

### `@rspack/dev-server` 2 behaviours that matter

- Its host checks block SharePoint unless `allowedHosts` covers it: cross-site `no-cors` requests (plain `<script>` tags from the tenant) get 403 "Cross-Origin request blocked" unless the `Host` is explicitly allowed, and websocket connections are closed unless the page's `Origin` is allowed. heft's dev server uses `allowedHosts: 'all'`.
- A listen error (port in use) is thrown from the server's `error` handler, i.e. as an uncaught exception, not as a rejection of `start()`; check the port before starting.
- The `headers` option is applied by a middleware placed before the dev middleware; middlewares appended in `setupMiddlewares` run after it, so they get the headers too. The dev middleware only handles `GET`/`HEAD` under its `publicPath` and passes everything else on; with `static: false` unmatched requests end in 404.
- With `client` enabled it adds its client (and the HMR client with `hot`) as global entries to every entry; the websocket URL comes from `client.webSocketURL` and is baked into each bundle.
- `setupExitSignals` defaults to registering SIGINT/SIGTERM handlers that exit the process; turn it off when the CLI handles shutdown.
- After a server restart the pages' clients reconnect by themselves; they reload the page only when the new server announces a different compilation hash (the hot check against the old hash finds no update). A per-start `output.hashSalt` makes that reliable even when the restart doesn't change any module.
- The dev middleware prints stats with `console.log` unless `devMiddleware.stats` is `'none'`; the server's own "Project is running at" lines go through the infrastructure logger (silent at `warn`).

### HMR inside SharePoint pages

- HMR works inside AMD bundles loaded by the page's RequireJS: the client gets a hash over the websocket, fetches `<bundle>.<hash>.hot-update.json` and loads the update chunk as a script from the absolute `publicPath`. Every runtime of the compilation gets a hot-update manifest on every rebuild, empty when nothing in it changed.
- **Several bundles on one page:** each bundle has its own runtime, but a shared `output.uniqueName` gives all of them the same hot-update global (`globalThis["rspackHotUpdate<uniqueName>"]`); the last bundle's handler wins and updates for the others are silently lost (no reload, no error). heft's webpack config has the same shape, which likely explains heft's "auto reload only on the first edit with two bundles". Rspack 2.3's handler only acts on chunk ids it is waiting for, so calling every runtime's handler is safe; fast-serve fans the global out ([decision](../decisions/several-bundles-one-compilation.md)).
- `compilation.hooks.runtimeModule` lets a plugin change a runtime module's source by assigning `module.source.source` (not allowed with `experiments.runtimeMode: 'rspack'`); the hot-update handler lives in the `jsonp_chunk_loading` runtime module of each entry chunk.
- `@rspack/plugin-react-refresh` 2.0: no `overlay` option any more; options `include`/`exclude`/`test` for its loader, `injectEntry`, `library` (default `output.uniqueName`). Its injected entry guards the DevTools-hook injection with a window flag `__reactRefreshInjected_<library>`; with several bundles sharing one compilation only the first bundle injects, so fast-serve injects per bundle with its own entry.
- **Nested React copies** (e.g. React 17 under `@pnp/spfx-controls-react`) give "Invalid hook call" once React is bundled; `resolve.alias` of `react`, `react-dom`, `react/jsx-runtime`, `react-dom/client` to the project's copy fixes it.
- An edit that reaches the bundle entry (the component class) falls back to a full page reload; CSS-module edits bubble to the importing component, which re-renders with the new class names. A re-evaluated module has `import.meta.webpackHot.data` set (an object even when no dispose handler stored anything); a first evaluation has none.
- Rspack's compile-error overlay works over SharePoint pages, but every bundle's client creates its own overlay iframe, and SharePoint re-evaluates a bundle whose AMD factory throws (three evaluations seen for one bundle with a syntax error, i.e. three clients and three overlays). fast-serve turns it off and draws one overlay from the window messages every client posts: `webpackErrors` (data: the printable error texts), `webpackWarnings`, `webpackInvalid`, `webpackOk`, `webpackStillOk`, `webpackClose`, `webpackProgress` (`self.postMessage({ type: 'webpack<Type>', data }, '*')`). Per build the server sends `invalid` when it starts, then either `still-ok` (same hash, no problems), `ok` (no problems), or `warnings` followed by `errors` when there are both; a warnings-only build gets no `ok`, and the client applies the hot update after `ok` or `warnings` (not when errors follow). A client also gets `ok` right after it connects.
- With `cheap-module-source-map` the emitted `.map` files map lines only; source names follow `output.devtoolModuleFilenameTemplate` (`webpack:///../<path relative to the context>`, i.e. relative to a virtual folder one level below the project root). Hot-update files get their own maps in the in-memory output.
- A module that failed to compile is emitted as a module that throws its error text when required; the bundle's AMD factory then throws and SharePoint logs `Could not load <bundle> in require.` with the RequireJS error (`requireType: 'define'`); a failing external script gives `requireType: 'scripterror'` with the module id `<componentId>_<version>/<external>`. SharePoint's web part error box shows such errors as `[object Object]`.
- A hidden tab (headless Chrome with another tab active, e.g. one restored from the profile's last session) throttles timers to 1 s; Fast Refresh re-renders through a timer, so measurements need a visible tab (`document.visibilityState`).

### Prototype numbers (medians, live on SharePoint Online)

| | heft start | Vite fast-serve | Rspack prototype |
|---|---|---|---|
| small project: server ready | 7.4 s | 0.81 s | 1.75 s |
| small project: TSX edit → DOM | 2.47 s (reload) | 29 ms | 103 ms |
| 1000 modules: server ready | 23.4 s | 0.83 s | 2.80 s (≈0.9 s with persistent cache) |
| 1000 modules: edit → DOM | manual reload | 35–63 ms | 226–263 ms |
| 1000 modules: cold load / F5 | 3.56 / 2.61 s | 8.41 / 5.58 s | 3.75 / 2.48 s |
| 1000 modules: localhost requests per load | 6 | 1181 | 6 |
| 1000 modules: server RSS peak | 1.20 GB | 0.48 GB | 0.59 GB |

The prototype reused heft's generated config; the implementation writes its own, so these numbers are a baseline, not a result.

### External docs

- Rspack 2 announcement and the v1 → v2 migration guide (rspack.rs), Rspack cache configuration, `@rspack/plugin-react-refresh` on npm.
- `@rushstack/heft-rspack-plugin` exists but is a separate Heft task plugin for Rspack 1.x; SPFx's heft plugins only attach to the webpack 5 plugin, and heft has no hook to swap its compiler, so a fast Rspack dev server has to run outside heft.

## Links

- [Startup performance and the persistent cache](../features/performance-and-cache.md)
- [Rspack compile](../features/rspack-compile.md)
- [HMR and React Fast Refresh](../features/hmr.md)
- [One compilation for several bundles](../decisions/several-bundles-one-compilation.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [Architecture overview](../architecture/overview.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](spfx-heft-pipeline.md)
- [Roadmap overview](../roadmap/overview.md)

## Evidence

- Source: Rspack prototype research (2026-11-19, Rspack 2.3.3 against SPFx 1.24.1 test projects on a tenant serving 1.25.0), npm registry, Rspack docs
- Confidence: high for observed behaviours; numbers are single-machine medians (3 starts per server)
- Last checked: 2026-11-19
