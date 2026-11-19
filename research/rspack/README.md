# Research: Rspack as a bundled dev server for SPFx 1.24

Date: 2026-11-19. Branch `v1.24`, package `1.24.0-beta.3`. All work was done on copies in `/var/tmp/rspack-research/` (`rea` = spfx-rea, `bench` = spfx-bench); the originals were not touched. Prototype code and raw results are there too, not in this repo (section 8).

## Short answer

- **Rspack 2.3.3 (latest stable) can run the webpack config heft generates for SPFx 1.24, with small changes.** The loaders (`sp-css-loader`, `html-loader`, `source-map-loader`), heft's `ManifestPlugin` (manifests, `manifests.js`, loc files) and `CopyReleaseAssetsPlugin` work unchanged. A Rust-side `hashFunction`, the AMD externals type, Rspack's own `DefinePlugin` and a one-line `ExternalModule.externalType` shim are needed. `SetPublicPathCurrentScriptPlugin` and `AsyncComponentPlugin` don't work under Rspack (they use webpack internals) and have to be dropped in dev. The output manifests are identical to heft's (6 of 7; the ACE manifest differs only because async loading is off).
- **A src-based Rspack dev server (`builtin:swc-loader` + `sass-loader` → `sp-css-loader`, `@rspack/dev-server` over HTTPS, `@rspack/plugin-react-refresh`) works inside a real SharePoint page.** Web parts, the Application Customizer, theme tokens, the compile-error overlay, Fast Refresh with state kept and a full reload on class edits were all verified live. HMR runs inside the AMD bundle that SharePoint's RequireJS loads.
- **Numbers (medians, section 4):** with Rspack, page loads look like heft's (spfx-bench: 6 requests, cold 3.75 s, F5 2.48 s), compared with fast-serve's 1181 requests, 8.4 s and 5.6 s. Edits take 0.1–0.3 s with state kept, compared with 30–60 ms for fast-serve and 2–3 s reloads for heft. The server is ready in 1.8–2.8 s (about 0.9 s with Rspack's persistent cache), compared with 0.8 s for fast-serve and 7–23 s for heft. Rspack's RSS is 0.3–0.6 GB.
- Two things the prototype had to fix: with **two bundles on one page HMR silently did nothing** (both Rspack runtimes share one hot-update global), and **PnP's nested React 17 gave "Invalid hook call"** once React is bundled for Fast Refresh. Both are fixed in the prototype (a small plugin and `resolve.alias`).
- Heft has no hook to swap its compiler. `@rushstack/heft-rspack-plugin` exists but is a separate task plugin (Rspack 1.x), and SPFx's heft plugins only attach to `@rushstack/heft-webpack5-plugin`.
- **Recommendation:** keep Vite as the default and add Rspack as an opt-in **bundled mode** for large projects where page load matters. Effort is **M–L, about 8–12 days** to reach today's feature level. Before committing, run a 1–2 day spike on the real 500+-request project. Vite's `experimental.bundledDev` is still experimental and was not prototyped (section 5).

---

## 1. Setup and method

| | |
|---|---|
| Machine | Intel i7-7500U (2 cores / 4 threads), 22 GB RAM, Linux 7.0.0-43, Node 24.21.0 |
| Browser | agent-browser Chrome 153.0.8010.36 `--headless=new`, saved SharePoint profile, CDP |
| Toolchain | SPFx 1.24.1, heft 1.3.2, webpack 5.105.4, `@rspack/core` 2.3.3, `@rspack/dev-server` 2.2.2, `@rspack/plugin-react-refresh` 2.0.3, react-refresh 0.19.0, sass-loader 17.1.0, fast-serve 1.24.0-beta.3 (packed from this branch, Vite 8.3.8) |
| Projects | spfx-rea copy on port 4410 (page `SitePages/spfx-rea.aspx`: HelloWorld + SecondWebPart, one bundle); spfx-bench copy on port 4411 (1000 modules, `SitePages/spfx-bench.aspx`: BenchTree + BenchPnp, **two bundles**) |
| Harness | `/var/tmp/rspack-research/harness/measure.mjs`: CDP client adapted from [research/benchmark](../benchmark/README.md). For each server: 3 starts; per start 1 cold load (empty browser cache) and 2 F5. In the last start, 3 edits per edit type. Medians are reported. One tab only: a second, background tab stopped Vite's HMR from applying, so the harness closes all other tabs first |
| Ready | heft: `manifests.js` returns 200 (dev-middleware waits for the first compile). Rspack: the first bundle returns 200 (compile done). fast-serve: `ready in` printed |
| Rendered | `performance.now()` from navigation start until both web parts are in the DOM (spfx-rea: SecondWebPart + HelloWorld "Well done" heading; spfx-bench: `__benchTreeReady`, `__benchPnpReady`, 846 tree nodes). SharePoint's own share is about 1.1–1.4 s ([benchmark §2.2](../benchmark/README.md#22-sharepoint-alone-same-page-no-debug-manifests)) |
| Edits | spfx-rea: HelloWorld.tsx text, HelloWorld.module.scss outline colour, Second.tsx text after clicking its counter (state check). spfx-bench: leaf `Node620.tsx`, mid `Node18.tsx`, `Node623.module.scss`. Latency = file write → DOM / computed style changed |
| heft port | heft 1.24.1 writes `https://localhost:4321/dist/` into the served `manifests.js` even on another port (known, [HANDOFF §5](../HANDOFF.md#5-performance)). The harness rewrites that one response via CDP `Fetch` for heft; the Rspack prototype rewrites it server-side |

## 2. Q1: does Rspack consume heft's webpack config?

The config was produced in plain Node with `WebpackConfigurationGenerator.generateWebpackConfigurationAsync` (`serveMode: true`), plus `_LegacyExternals.updateWebpackConfiguration` (adds the `localizedResources` / `config.json` externals and lets `ManifestPlugin` emit loc files, as heft's `third-party-externals-plugin` does). It was cross-checked against a dump from a `config/spfx-customize-webpack.js` hook during `heft start`. Heft's config is for **`lib/` output of tsc and heft-sass** (`lib/**/*.js`, `*.module.scss.css` found through `resolve.extensions: ['.css']`); it has no TS or Sass loaders.

`asIs.cjs` fed it to `rspack()` and compiled it (heft's `lib/` from an earlier build): 0.5 s compared with webpack's 0.95 s for spfx-rea. Every component manifest equals heft's except the ACE manifest (see `AsyncComponentPlugin` in the table).

| Piece | Rspack 2.3.3 | Note |
|---|---|---|
| `output.hashFunction: 'md5'` | ❌ panic | Rust panic "Unsupported hash function: 'md5'. Expected one of: xxhash64, md4, sha256". Use `xxhash64` |
| `output.libraryTarget: 'amd'` | ⚠️ ignored | moved to `output.library.type` in Rspack 2 ([migration guide](https://rspack.rs/guide/migration/rspack_1.x)). Per-entry `library.type: 'amd'` still makes AMD bundles, but externals were emitted as `module.exports = @microsoft/sp-core-library;` with an empty `define([])` until `externalsType: 'amd'` was set |
| externals (string list), AMD `define([...deps])` | ✅ with `externalsType: 'amd'` | dependency list and module ids match heft's |
| `webpack.DefinePlugin` instance | ❌ | throws inside webpack's parser hooks; replace with `rspack.DefinePlugin(plugin.definitions)` |
| `SetPublicPathCurrentScriptPlugin` (`@rushstack/set-webpack-public-path-plugin`) | ❌ | uses `JavascriptModulesPlugin.getCompilationHooks().render`, which Rspack lacks. Dev: `output.publicPath = 'https://localhost:<port>/dist/'` (or `'auto'`) |
| `AsyncComponentPlugin` | ❌ | "Compilation.hooks.afterOptimizeChunkModules is not supported in rspack"; it also builds `ExternalModule`s, edits the chunk graph and replaces the `ImportDependency` template. Dev: generator option `disableAsyncComponentLoading: true`. Effect: externals used only by async chunks become entry dependencies (the ACE manifest lists `sp-property-pane` instead of `sp-core-library`), which is fine in dev |
| `ManifestPlugin` (`processAssets`) | ✅ with a shim | detects externals by `module.externalType && module.userRequest`; Rspack's `ExternalModule` has `userRequest` but no `externalType`, so every manifest lost its `scriptResources`. A plugin defining `ExternalModule.prototype.externalType` fixes it. It writes `temp/build/manifests.js` (cumulative manifest) and the `*Strings_en-us.js` loc files as before |
| `CopyReleaseAssetsPlugin` | ✅ | not needed in dev |
| `sp-css-loader` (CSS modules, theme tokens), `html-loader`, `source-map-loader`, `asset/resource`, `asset/source` | ✅ | JS loaders run as-is. `source-map-loader` on every `.js` is slow and was dropped in dev |
| `(?<!…)` lookbehind in rule tests | ✅ | |

Rspack 2 changes to keep in mind: the packages are pure ESM (`require(esm)` works on Node 20+). `module.parser.javascript.exportsPresence` now defaults to `error`, while heft's webpack only filters "export … was not found" warnings, so a mode would set it to `auto`. `@rspack/dev-server` 2 uses `connect-next` instead of Express (heft's own `setupMiddlewares` uses `app.options`/`express.static` and is not reusable as-is). Source: [Upgrading from v1 to v2](https://rspack.rs/guide/migration/rspack_1.x).

**Heft and Rspack.** `@rushstack/heft-webpack5-plugin` loads `webpack` itself (rig package, then built-in) and has hooks (`onLoadConfiguration`, `onConfigure`, `onAfterConfigure`, `onEmitStats`, `onGetWatchOptions`) but **no hook to replace the compiler**. `@rushstack/heft-rspack-plugin` 0.3.33 is a separate Heft task plugin (`rspack-plugin`, `--serve` with `@rspack/dev-server` 1.x, peer `@rspack/core ^1.6.0-beta.0`, `@rushstack/heft ^1.3.5`, newer than SPFx's 1.3.2). SPFx's plugins (`spfx-webpack-configuration-plugin`, `third-party-externals-plugin`, `webpack-patch`, …) all call `requestAccessToPluginByName('@rushstack/heft-webpack5-plugin', 'webpack5-plugin')`, so they do nothing with the Rspack plugin. Running Rspack *inside* heft would also keep heft's tsc → sass → webpack watch pipeline, which is what makes `heft start` slow (spfx-bench: port listens after 18 s). A fast Rspack mode therefore has to run outside heft, the way fast-serve runs Vite, and reuse heft's generator.

## 3. Q2: the Rspack dev server prototype

`devServer.cjs` (≈190 lines) + `heftConfig.cjs` + `rspackCompat.cjs`:

1. Generate heft's config (as above) from a `config.json` view whose entrypoints are mapped `./lib/**.js` → `./src/**.ts(x)` and `localizedResources` `lib/` → `src/`. The heft generator still writes the multi-component bundle entry (`temp/build/bundle-entries/<bundle>.js`, `export * as a from '…/src/…'`).
2. Adapt it: the changes from section 2, plus rules `builtin:swc-loader` for `.ts`/`.tsx` (legacy decorators, `useDefineForClassFields: false`, classic JSX runtime, `react.refresh`) and `.module.scss` → `sass-loader` (`sass-embedded`, `modern-compiler`, rig `silenceDeprecations`, `NodePackageImporter`) → heft's own `sp-css-loader` rule options (same CSS class names and theme-token handling as heft). Also `resolve.extensions` `.ts/.tsx`, `resolve.tsConfig`, `devtool: 'cheap-module-source-map'` and `cache: true`.
3. React: `react`, `react-dom`, `react-dom/client` are removed from externals and bundled from the project (development build, needed for Fast Refresh, same as fast-serve), with `resolve.alias` to the project's copy, so nested copies (`@pnp/spfx-controls-react` → React 17) don't create a second React.
4. `@rspack/dev-server`: HTTPS with the SPFx dev certificate (`@rushstack/debug-certificate-manager`), `hot: true`, client `wss://localhost:<port>`, CORS + `Access-Control-Allow-Private-Network` headers and an `OPTIONS` handler. Bundles come from memory under `/dist/`; `/temp/build/manifests.js` is served from disk with the 4321 → `<port>` fix.

How SharePoint loads it: the page's RequireJS fetches `manifests.js`, then `<bundle>.js` from `internalModuleBaseUrls`. That file is an ordinary webpack-style AMD module (`define(["react"…, "@microsoft/sp-core-library", …], function (…) { … })`) whose entry also runs the dev-server client and the React Refresh runtime. The `sp-*` dependencies come from the page through RequireJS, exactly as with heft. HMR then runs inside the bundle's own runtime: the client gets a hash over the websocket, fetches `<bundle>.<hash>.hot-update.json` and loads `<chunk>.<hash>.hot-update.js` as a script from `publicPath`. The update is applied to the bundle's module registry, and Fast Refresh re-renders components with state kept. Updates that reach the bundle entry (web part class) fall back to a full page reload.

Verified live on the tenant (view only, nothing saved):
- spfx-rea web parts render; theme tokens resolve; `[HMR] Waiting for update signal from WDS…`;
- TSX edit → hot update, Second web part's counter state kept (3/3 runs);
- SCSS edit → applied without reload (it bubbles from the `sp-css-loader` module to the component, which re-renders with new class names; the old `<style>` stays in the page);
- edit in `HelloWorldWebPart.ts` → full page reload;
- syntax error → Rspack's overlay over the SharePoint page; it clears after the fix;
- Banner Application Customizer via the `default` serve configuration's `loadSPFX=true&customActions=…` URL, together with the web parts;
- spfx-bench (two bundles, PnP controls, `@pnp/sp`, Fluent) renders; with the HMR fix below, edits in the tree bundle hot-update.

Problems found and fixed in the prototype:
- **Two bundles on one page → no HMR at all** (spfx-bench, first run: 9 of 9 edits rebuilt in about 110 ms and never reached the DOM, no reload, no error). Every bundle has its own runtime, but `output.uniqueName` is shared, so both define `self["rspackHotUpdate<uniqueName>"]`. The second bundle's handler overwrites the first one, and hot-update chunks are delivered to the wrong runtime. `PerRuntimeHotUpdateGlobalPlugin` rewrites the global per runtime in the emitted bundle and hot-update files. After that, all 9 edits applied in 0.2–0.35 s. heft's webpack config has the same shape, which probably explains heft's "auto reload only on the first edit with two bundles" (also seen here: on spfx-bench heft rebuilt every edit but never reloaded). A cleaner fix is a `MultiCompiler` with one `uniqueName` per bundle (needs `ManifestPlugin` per bundle).
- **"Invalid hook call"** on spfx-bench from a nested React 17 under `@pnp/spfx-controls-react`, fixed by the React alias (fast-serve does the same with `resolve.dedupe`).

## 4. Q3: numbers

Medians; server start = 3 runs; cold = 3 loads (one per start); F5 = 6 loads; edits = 3 each. "Rendered" includes SharePoint's own ~1.1–1.4 s.

### spfx-rea (small: 3 web-part/extension sources in the page bundle; the main project)

| Metric | heft start | fast-serve (Vite 8) | Rspack prototype |
|---|---|---|---|
| Server start → ready | **7.4 s** (port listens 6.6 s; `--clean`) | **0.81 s** (`ready in`) | **1.75 s** (port listens 1.2 s; first compile ~0.55 s inside) |
| Edit TSX → DOM | 2.47 s (full reload; webpack 0.08–0.13 s + tsc + reload) | **29 ms** | **103 ms** (rebuild 50–60 ms) |
| Edit SCSS → DOM | 2.17 s (full reload) | **30 ms** | **102 ms** (rebuild ~100 ms) |
| Edit TSX, React state kept | no (reload) | yes 3/3 | yes 3/3 |
| Cold load → both web parts | 2.50 s | 2.89 s | 2.55 s |
| F5 | 2.24 s | 2.17 s | 1.99 s |
| localhost requests per load | 5 | 32 | 5 |
| bytes from localhost | 133 KB (gzip) | 3.4 MB (550 KB on some F5s) | 1.4 MB (no compression) |
| Server RSS ready / end / peak | 0.64 / 0.50 / 0.65 GB | 0.14 / 0.19 / 0.24 GB | 0.31 / 0.32 / 0.33 GB |

At this size all three load in the same 2–2.9 s (SharePoint dominates). The difference is start time and the edit loop.

### spfx-bench (1000 generated modules, two bundles; scale data point)

| Metric | heft start | fast-serve (Vite 8) | Rspack prototype |
|---|---|---|---|
| Server start → ready | **23.4 s** (port listens 18.0 s) | **0.83 s** | **2.80 s** (port listens 1.1 s; Rspack compile ~1.6 s). Persistent cache, warm: compile 0.42–0.43 s, ~0.9 s from script start (2 runs, outside the harness) |
| Edit leaf TSX → DOM | no automatic reload (2 bundles); webpack 0.8–1.0 s per rebuild, then a manual F5 (~2.6 s) | **63 ms** | **263 ms** (rebuild 0.2–0.28 s) |
| Edit mid TSX (57 descendants) | same | **35 ms** | **257 ms** |
| Edit SCSS | same (webpack 0.6–0.9 s) | **59 ms** | **226 ms** |
| Cold load → both web parts | 3.56 s | 8.41 s | **3.75 s** |
| F5 | 2.61 s | 5.58 s | **2.48 s** |
| localhost requests per load | 6 | **1181** | 6 |
| bytes from localhost | 774 KB (gzip) | 15.8 MB | 9.5 MB (no compression, dev React + Fluent + PnP unminified) |
| Server RSS ready / end / peak | 1.18 / 0.85 / 1.20 GB | 0.14 / 0.46 / 0.48 GB | 0.57 / 0.59 / 0.59 GB |
| Server CPU per cold page load | 0.2 s | 5.5 s (transforms) | 0.08 s |

The fast-serve and heft numbers match the earlier [benchmark](../benchmark/README.md) (8.5 s / 5.8 s / 1180 requests and 3.3 s / 2.6 s). Rspack moves the cost from page load to start (one full compile of the project, 1.6 s for 1000 modules) and to each edit (0.2–0.3 s instead of 30–60 ms). It keeps heft's load time and request count.

Not measured: Rspack start at larger sizes (expected to grow with module count, since there is no lazy compilation), `compress: true` (would cut the 9.5 MB on the wire), Rspack `lazyCompilation`.

## 5. Q4: Vite 8 bundled dev mode (docs only, not prototyped)

- Experimental since Vite 8.1 (formerly "Full Bundle Mode"), enabled by `experimental.bundledDev: true` or `--experimental-bundle`. The team's own 10,000-component test reports about 15× faster start and 10× faster full reloads, with HMR independent of app size ([Vite 8.1 announcement](https://vite.dev/blog/announcing-vite8-1)).
- It bundles lazily (only what the requested page needs). Phase 1 (basic client-side rendering) has shipped and Phase 2 (complete client-side support) is in progress. Third-party plugins may not work, and SSR features are unsupported ([design doc and roadmap](https://github.com/vitejs/vite/discussions/22746)). Vite reported 80 % of its non-SSR tests passing on 2026-10-16. Plugin-side changes: plugins must register watched files (`this.addWatchFile`), output URLs follow a fixed `chunks/*` layout, and `waitForRequestsIdle` doesn't apply.
- For fast-serve this would mean: backend integration without `index.html` (an `input` entry, the HMR client imported by the entry), the `/@spfx/` shim and entry middleware, virtual modules, pre-bundling-based `sp-*` facades and the `require`/AMD transforms all re-checked against an experimental API. The project's decision so far is **not to use `bundledDev`** ([decision](../../kb/decisions/unbundled-dev-without-warmup.md)). Worth re-checking when it leaves experimental status; not a candidate today.

## 6. Q5: recommendation and effort

**Keep Vite as the default; add Rspack as an opt-in bundled mode** (for example `fast-serve --bundled` / `"mode": "bundled"` in `fast-serve/config.json`). Validate it first with a short spike on the real 500+-request project.

Why:
- Rspack solves exactly the page-load problem (heft-level loads and requests at 1000 modules) and keeps a good inner loop (0.1–0.3 s HMR with state kept, 2–3 s start, 0.9 s warm). Neither Vite mode does that today.
- Vite remains better at everything else: 30–60 ms edits, 0.8 s start independent of project size, lowest memory, and the feature set is finished and documented. For small and medium projects page loads are equal anyway (spfx-rea: 2.0–2.9 s for all three).
- Much of what fast-serve rebuilds for Vite comes for free in a webpack-shaped pipeline: heft's own manifests, externals and loc handling, webpack's `require`/UMD/AMD semantics, tolerance of type-only re-exports, library `.module.scss.css` through `resolve.extensions`. And heft's `config/spfx-customize-webpack.js` could be reused as-is (for Rspack-compatible plugins) instead of `vite.extend.mts`.
- Risks: the mode depends on heft internals (`WebpackConfigurationGenerator` options, `_LegacyExternals`, `CONFIG_JSON_SYMBOL`, `ManifestPlugin` detecting externals) that can change in any SPFx minor. Two engines double test and maintenance work. Rspack start time grows with project size.

A full switch to Rspack is not recommended. It would trade a 5–10× slower edit loop and slower start for load times that only matter on large projects, and would throw away finished Vite work.

### What a Rspack mode needs (estimate M–L, ~8–12 dev days)

| fast-serve feature (Vite) | In a Rspack mode | Effort |
|---|---|---|
| project model, options, SPFx version check, certificate, extension / `serveConfigurations` URLs | reuse; config from heft's generator + the adaptations in §2–3; port fix for `manifests.js`; print URLs (heft's `SPFxDebugPageUrlUtilities` can be reused) | 2 d |
| shim + ESM entry + `exportName` | **not needed**: heft's AMD bundle, multi-component entry and manifests | – |
| `sp-*` on-demand facades, `config.json` externals | **not needed**: heft's AMD externals + manifests (`config.json` externals via `_LegacyExternals`; untested with a real external) | – |
| HMR + Fast Refresh, React dedupe, development React | per-runtime hot-update global (or `MultiCompiler`), React alias, refresh plugin; verify edits in every bundle, ACE/extension edits | 1–2 d |
| tsconfig → Oxc whitelist, `paths` resolver, type-only names, `const enum` checks | map the same tsconfig options to SWC (`legacyDecorator`, `decoratorMetadata`, `useDefineForClassFields`); `resolve.tsConfig` for `paths` (rig-extended `include` untested); `exportsPresence: 'auto'`; `const enum` limits stay (SWC is per-file too) | 1–2 d |
| Sass `silenceDeprecations`, `pkg:` importer, `.module.scss` typings | same options on `sass-loader`; typings generator reused unchanged | 0.5–1 d |
| `require()` rewrite, AMD isolation (`amdPackages`), library `.module.scss.css` | **not needed** (webpack semantics, heft's rules) | – |
| browser errors in terminal, runtime-error overlay, readable load errors | Rspack overlay covers compile errors; runtime-error overlay + terminal forwarding to be rebuilt on the dev-server websocket | 1–2 d |
| `fast-serve/vite.extend.mts` | replace or complement with heft's `config/spfx-customize-webpack.js` applied to the Rspack config (webpack-only plugins will fail) | 1 d |
| theme tokens | **not needed** (`sp-css-loader` + `load-themed-styles`, same as heft) | – |
| tests, docs, verification (extensions, ACEs, library components, real project) | | 2–3 d |

## 7. What could not be verified

- No real (customer-sized) project: only spfx-rea (tiny) and the generated spfx-bench. The 500+-request project was not available here.
- Single machine, 3 starts per server; heft numbers on spfx-bench edits have no automatic reload (heft's two-bundle issue), so only webpack rebuild times are given.
- Rspack prototype not tested with: Command Set, Field and Form Customizers, ACEs on the workbench (bundles compile and manifests match heft's, but nothing was loaded live), library components, `config.json` externals, localized strings other than `en-us`, `spfx-customize-webpack.js`, lazy compilation, larger projects (2000+ modules), long sessions/memory growth.
- Edits in the second bundle on spfx-bench (BenchPnp) were not measured; only the tree bundle was edited after the HMR fix.
- Rspack's `persistent` cache was measured outside the harness (2 warm runs) and not on page loads.
- The "Uncaught (in promise)" console entries appeared with all three servers (SharePoint/PnP telemetry) and were not investigated.
- Vite `bundledDev`: documentation only.

## 8. Reproduce

Everything lives in `/var/tmp/rspack-research/` (temporary, not in this repo):
- `rea/`, `bench/`: project copies (ports 4410/4411 in `config/serve.json`, fast-serve beta.3 tarball and Rspack packages installed with npm);
- `rea/rspack/heftConfig.cjs` (heft config in plain Node), `rspackCompat.cjs` (plugin adaptations, `ExternalTypeCompatPlugin`, `PerRuntimeHotUpdateGlobalPlugin`), `asIs.cjs` (Q1 run against `lib/`), `devServer.cjs` (the dev server; env `PORT`, `DEVTOOL`, `PERSISTENT_CACHE=1`, `BUNDLE_REACT=0`, `PER_RUNTIME_HMR=0`);
- `harness/measure.mjs --kind=heft|fast|rspack [--project= --port= --page= --profileFile=]`, profiles `rea-profile.json`, `bench-profile.json`;
- `results/*.json|log`: raw runs (`bench-rspack-sharedHmrGlobal.*` = the failing run before the HMR fix), `heft-webpack-config.json` = heft's dumped config.

The adaptations from heft's config to a dev config, in short:

```js
configuration.externalsType = 'amd';
configuration.output.hashFunction = 'xxhash64';
configuration.output.publicPath = `https://localhost:${port}/dist/`;
configuration.plugins = [
  new ExternalTypeCompatPlugin(),
  ...configuration.plugins
    .filter((plugin) => !['SetPublicPathCurrentScriptPlugin', 'AsyncComponentPlugin', 'CopyReleaseAssetsPlugin'].includes(plugin.constructor.name))
    .map((plugin) => (plugin.constructor.name === 'DefinePlugin' ? new rspack.DefinePlugin(plugin.definitions) : plugin)),
  new ReactRefreshRspackPlugin({ overlay: false }),
  new PerRuntimeHotUpdateGlobalPlugin()
];
configuration.module.rules.push(
  swcRule(/\.ts$/, false),
  swcRule(/\.tsx$/, true),
  { test: /\.module\.scss$/i, use: [...heftModuleCssRule.use, sassLoader] },
  { test: /(?<!\.module)\.scss$/i, use: [...heftGlobalCssRule.use, sassLoader] }
);
```

Sources: [Announcing Rspack 2.0](https://rspack.rs/blog/announcing-2-0), [Rspack: upgrading from v1 to v2](https://rspack.rs/guide/migration/rspack_1.x), [Rspack cache](https://rspack.rs/config/cache), [`@rspack/plugin-react-refresh`](https://www.npmjs.com/package/@rspack/plugin-react-refresh), [`@rushstack/heft-rspack-plugin`](https://www.npmjs.com/package/@rushstack/heft-rspack-plugin), [Vite 8.1 announcement](https://vite.dev/blog/announcing-vite8-1), [Vite bundled dev design doc](https://github.com/vitejs/vite/discussions/22746); heft sources read in `node_modules` (`@rushstack/heft-webpack5-plugin` 1.3.30 `Webpack5Plugin.js`, `@microsoft/spfx-heft-plugins` 1.24.1 `WebpackConfigurationGenerator.js`, `ManifestPlugin.js`, `AsyncComponentPlugin.js`, `LegacyExternals.js`, `updateServeConfigAsync.js`).
