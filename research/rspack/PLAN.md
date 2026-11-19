# Plan: fast-serve on Rspack (branch `rspack`)

Goal: the same product as the Vite version (branch `v1.24`, `1.24.0-beta.3`): a zero-config `fast-serve` CLI replacing `heft start` for SPFx 1.24.x, serving web parts, extensions and ACEs on a real SharePoint page with HMR and React Fast Refresh, built on Rspack (`@rspack/core`, `@rspack/dev-server`, `@rspack/plugin-react-refresh`, `builtin:swc-loader`). Then compare it with Vite fast-serve, `heft start` and Vite `bundledDev` (task R24).

Binding: **our own Rspack config, written from scratch.** No heft webpack config, no `@microsoft/spfx-heft-plugins` internals (`WebpackConfigurationGenerator`, `ManifestPlugin`, `AsyncComponentPlugin`, `_LegacyExternals`…). Reading heft's sources and output to learn the expected format is fine. Public npm packages that SPFx projects already have (for example `@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin` for typings) may be loaded from the project, as the Vite version does.

Background: [prototype and numbers](README.md), [bundled-dev comparison](../bundled-dev/README.md), [HANDOFF](../HANDOFF.md). Reference implementation: `git show v1.24:src/...`, the v1.24 `kb/`, README and `research/`.

## Conventions

- Size: **S** ≤ ½ day, **M** ≈ 1 day, **L** ≈ 2 days of agent work (upper bound for one task).
- Status: ⬜ open · 🔄 in progress · ✅ done · ⏭️ not needed (reason in the row).
- Every task ends with `pnpm -s build && pnpm -s lint && pnpm -s typecheck && pnpm -s test` green, the version bumped to the next `1.24.0-rspack.<n>`, and the KB updated for what changed.
- "Integration test" = a vitest test running a real Rspack compile (or dev server) against a fake SPFx project in `test/fixtures/`. "Live" = the `spfx-debugging` skill on a copy of spfx-rea / spfx-bench in `/var/tmp/rspack-impl/`.
- Module layout as in the Vite version: `src/<feature>/index.ts` returns the feature's Rspack config contribution (rules, plugins, resolve, dev-server middlewares) plus its own runtime and tests; `project/` stays bundler-free.

## Architecture (target)

config (`fast-serve/config.json`, CLI flags, `config/serve.json`) → **project model** (plain Node: `config/config.json` bundles/components, source manifests, `serve.json` configurations, SPFx libraries in `node_modules`, `config.json` externals, loc files, tsconfig, `config/sass.json`, SPFx version) → **generated artifacts** (bundle entry modules, debug `manifests.js`, typings) → **Rspack compiler + `@rspack/dev-server`** (one compilation; one entry per SPFx bundle, AMD output, in-memory) → **browser runtime** (Rspack's HMR runtime and React Refresh inside each AMD bundle, plus small fast-serve runtimes: error forwarding).

Key differences from the Vite version, decided up front:
- SharePoint loads ordinary AMD bundles (`define([...externals], factory)`) like heft's, so no AMD shim, no ESM entry, no `/@spfx/` endpoints, no top-level-await facades.
- webpack semantics come for free: `require()`, UMD/AMD in dependencies, CommonJS interop, named imports from AMD externals as property reads at runtime, tolerance of type-only re-exports (`exportsPresence: 'auto'`).
- The cost moves from page load to start and edits: one full compile at start (spfx-bench ≈1.6 s), rebuild 0.1–0.3 s per edit (prototype numbers).

## Phases and tasks

### Phase 0

| # | Task | Size | Status |
|---|---|---|---|
| R0 | Plan, package scaffold (Rspack deps, CLI stub, tests), README/HANDOFF for the branch, fresh KB | M | ✅ |

### Phase 1: core (web parts on the page with HMR)

| # | Task | Size | Status |
|---|---|---|---|
| R1 | CLI and options | M | ✅ |
| R2 | Project model | M | ✅ |
| R3 | Rspack compile: entries, TS via SWC, AMD output, SPFx library externals (minimal) | L | ✅ |
| R4 | HTTPS dev server, debug `manifests.js`, debug URL, web parts on the page | L | ✅ |
| R5 | HMR and React Fast Refresh | L | ⬜ |

**R1 CLI and options.** `fast-serve` bin, `runCli` (`-p/--port`, `--page-url`, `--locale`, `--config`/`--serve-config`, `--no-overlay`, `-h`, `-v`), `fast-serve/config.json` (JSONC) with precedence flags > file > `config/serve.json` > defaults, `{tenantDomain}` = `SPFX_SERVE_TENANT_DOMAIN`, warning for the old `config/fast-serve.json`, SPFx `major.minor` check at start (1.24.x only), logger with `[fast-serve]` prefix, exit codes, SIGINT/SIGTERM shutdown.
- Vite lessons: port `config/options.ts`, `runCli.ts`, `project/spfxVersion.ts`, `utils/jsonc.ts` almost unchanged (bundler-free); `amdPackages` is dropped (see R16). Help text without Vite wording.
- Acceptance: unit tests for parsing, precedence, invalid port, old-file warning, version check (ported from v1.24); `fast-serve --help/--version` from the packed tarball.
- Done (`1.24.0-rspack.1`): ported as planned; `amdPackages` in `fast-serve/config.json` is ignored with a warning (not a fatal unknown key, so Vite-version configs keep working); `--port abc` reports the raw value; SIGINT/SIGTERM helper ready for R4 (nothing to close yet). Until R4 the CLI prints the resolved options and bundles, then exits 1 with "the Rspack dev server is not implemented yet". Checked from the tarball in the spfx-rea/spfx-bench copies (`--help`, `--version`, summary, unknown `--config` warning, bad port).

**R2 Project model.** Plain Node, no Rspack import: bundles and components from `config/config.json`, entry `./lib/**.js` → `./src/**.ts(x)`, source manifests (JSON with comments), `localizedResources` (`lib/` → `src/`), `serve.json` (port, `initialPage`, `serveConfigurations`), SPFx libraries in `node_modules` (any package with an SPFx library manifest: id, version), `config.json` externals, tsconfig (`extends` incl. rig, `paths`, compiler options), merged `config/sass.json`, cache + `invalidate(file)`.
- Vite lessons: port `project/` (multi-component bundles, rig `extends`, `sass.json` `extends` arrays appended, missing-source errors) with its tests and fixtures.
- Acceptance: ported unit tests on fixtures; a model snapshot of spfx-rea and spfx-bench copies (bundles, components, libraries, configurations) matches what heft's config would produce (compare with the dumped heft config from the prototype run, read only).
- Done (`1.24.0-rspack.1`): `project/` ported with its tests and the `basic`/`multi` fixtures (heft-customization detection left for R19). New: `@microsoft/microsoft-graph-client` is an SPFx library when installed (heft's fixed id `32b9363b-…`, no manifest in the package), like heft's non-standard externals; heft's other non-standard externals `react`, `react-dom`, `react-dom/client` are deliberately not libraries (bundled development React). Snapshot check `research/rspack/scripts/model-snapshot.mjs` on the copies: spfx-rea 5 bundles/7 components, entries equal heft's config, export names `a`/`b`/`c`, versions and every library id/version in heft's `dist/*.manifest.json` match, every heft external is a library or loc resource; spfx-bench 2 bundles, 16 libraries, all match. Only differences: the React family (by design).

**R3 Rspack compile.** Our config builder: one entry per SPFx bundle (single component: the source entry; several: a generated entry module `export * as <exportName>` per component, written to `temp/fast-serve/` or a virtual module, decided here), `output.library.type: 'amd'` (anonymous `define`, like heft), `externalsType: 'amd'`, `output.publicPath` = `https://localhost:<port>/dist/`, `output.hashFunction: 'xxhash64'`, `builtin:swc-loader` for `.ts/.tsx` (classic JSX runtime; decorator/class-field options from tsconfig come in R13, R3 uses the SPFx rig defaults), `resolve.extensions`, `mode: 'development'`, `devtool` (start with `cheap-module-source-map`), `cache: true`, watch ignores (`lib`, `lib-*`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`), `DEBUG`/`NODE_ENV` via `rspack.DefinePlugin`. Minimal externals: the `@microsoft/sp-*` packages the project model finds (full rules in R8), React bundled from the project.
- Vite lessons: React stays the project's development copy (Fast Refresh); DefinePlugin values as in `transforms/defines.ts`.
- Prototype lessons: Rspack 2 panics on `md5`; `library.type` (not `libraryTarget`); externals need `externalsType: 'amd'` or they become `module.exports = …`; `exportsPresence` defaults to `error` in Rspack 2 → `auto`.
- Acceptance: integration test compiles a fixture with one single-component and one multi-component bundle; asserts the AMD dependency list, that externals are not bundled, and that `exportName` exports exist; compile of the spfx-rea copy without errors.
- Done (`1.24.0-rspack.2`): config builder composed from feature contributions (`entries`, `typescript`, `externals`, `react`, `localization`, `assets`, `styles`, `defines`; merged rules/plugins/alias/extensions/externals). Decisions: the multi-component entry is a virtual module (`rspack.experiments.VirtualModulesPlugin`, nothing written to the project); **Rspack 2 disables AMD parsing unless `amd` is set**, so `amd: {}` (AMD loc files and UMD dependencies parse like in webpack); externals = every SPFx library of the model (incl. `@microsoft/microsoft-graph-client`) by exact request; React family aliased to the project's copy (nested copies collapse); `uniqueName`/`chunkLoadingGlobal` derived from a hash of the package name (no clash with the installed production bundle); watch ignores anchored at the project root (a `src/lib/` folder stays watched); SWC target es2020, legacy decorators, `useDefineForClassFields: false`, classic JSX dev transform. Pulled forward because spfx-rea can't compile without them: `localizedResources` bundled through `resolve.alias` to the model's strings file (locale + `en-us` fallback; rest in R10), images/fonts as `asset/resource` like heft's list (R12 verifies), basic styles: `sass-loader` (project `sass-embedded`/`sass`, `modern-compiler`, `silenceDeprecations`, `NodePackageImporter`) → project `@microsoft/sp-css-loader` (heft's rules for `.module(.scss).css` and global `.css`). Until R4 the CLI compiles once into `temp/fast-serve/dist`, prints the result and exits 1. Verified: integration tests on `test/fixtures/compile` (define deps, externals not bundled, nested React collapsed, `default`/`a`/`b` exports by evaluating the AMD module, loc + `--locale`, asset URL, DEBUG/NODE_ENV, Sass module class names + theme tokens); tarball in the spfx-rea/spfx-bench copies: 0 errors/0 warnings, `research/rspack/scripts/compare-amd.mjs` against heft's `dist/`: identical exports for all 7 bundles; define lists equal heft's minus React family and loc names (bundled by design) — ACE: heft adds `sp-core-library` for its async component loader, ours hoists `sp-property-pane` from the quick-view chunk onto the entry `define` (R7 expectation holds without a plugin). Compile (Rspack time / CLI wall, 3 runs): spfx-rea 525–547 ms / 1.3 s, spfx-bench 1.40–1.43 s / 2.2 s. Left for later: CSS class names differ from heft's (hash input is the `.scss` path, heft hashes the `lib` `.module.scss.css`) → R11; no warning filter yet (R13); deep library imports (R8).

**R4 Dev server, manifests, debug URL.** `@rspack/dev-server` over HTTPS with the SPFx dev certificate (`@rushstack/debug-certificate-manager`, same as heft), `host: 'localhost'`, CORS + `Access-Control-Allow-Private-Network` headers and an `OPTIONS` handler, bundles from memory under `/dist/`. Our `GET /temp/build/manifests.js` (AMD module with `getManifests()`), rendered on request from the project model + compilation facts: per component the source manifest, `loaderConfig.internalModuleBaseUrls` = `https://localhost:<port>/dist/`, `entryModuleId` = bundle name, `scriptResources` (bundle path + the externals the bundle really uses: `{type:'component', id, version}`, `@microsoft/sp-loader`), `exportName` for multi-component bundles, dev icon URLs (relative `./` icons made absolute). Ready banner with components and the page URL + debug query (`?debugManifestsFile=…&debug=true&noredir=true`). Nothing else from the project root is served (heft serves the whole root). Port taken → clear error.
- Vite lessons: port `manifests/` (rendering and icon URLs, not the shim parts), `server/debugUrl.ts`, `server/certificate.ts`; "Allow debug scripts" and CSP rules unchanged; manifests always `no-store`; heft's 4321 port bug must not exist (we render the URL ourselves).
- Acceptance: unit tests for manifest rendering (single/multi bundle, icons, externals list); integration test: dev server on a free port, `manifests.js` evaluates in a fake RequireJS `define`, `/dist/<bundle>.js` is served with the CORS/PNA headers. **Live:** spfx-rea HelloWorld + SecondWebPart render, theme tokens visible (needs R11 for SCSS; if not yet, use a plain-CSS fixture or accept unstyled), no console errors from our bundles.
- Done (`1.24.0-rspack.3`): `@rspack/dev-server` (HTTPS, dev certificate, `host: 'localhost'`, `static: false`, in-memory output, `devMiddleware.publicPath: '/dist/'`, `stats: 'none'`, `setupExitSignals: false`, compression off), CORS/PNA via `headers` + an `OPTIONS` → 204 middleware, our `manifests.js` (rendered per request, `no-store`, waits for the first compile), relative manifest icons served from their source files, 404 for everything else; ready banner and debug URL ported; compile lines `compiled/rebuilt in … ms: n errors, m warnings`; SIGINT/SIGTERM stop the server and close the compiler (idempotent). Feature contributions can now add dev-server middlewares. Decisions: `scriptResources` per bundle = the SPFx libraries among the external modules of the entry's chunks and their async chunks (collected on every `done`) + `@microsoft/sp-loader`, like heft; `allowedHosts: 'all'` like heft (otherwise `@rspack/dev-server` answers SharePoint's cross-site `no-cors` script requests with 403 and closes the websocket for the tenant origin); the port is checked on 127.0.0.1 and ::1 before start because the dev server throws listen errors as uncaught exceptions; `hot` + `liveReload` on with client `logging: 'warn'` and the compile-error overlay per `--no-overlay` (polish in R5/R14); `compileOnce` stays for tests. Verified: unit tests (manifest rendering incl. per-bundle resources and icon files, library resources, ready banner, debug URL ported), integration test with a real dev server on a free port and a self-signed `openssl` certificate (manifests evaluated in a fake `define` with the right ids/versions/export names/base URL, `/dist/` bundle with CORS/PNA and `wss` client URL, cross-site `no-cors` allowed, preflight 204, icon 200, project files 404, port reported busy and released after close). **Live** (copy of spfx-rea, tarball, port 4431): HelloWorld and Second render on `SPFX_DEBUG_PAGE_URL`, links in the theme primary colour (`#8764b8`, tokens resolved through `sp-css-loader`), no console errors (only SharePoint's own warnings), 3 dev-server requests per page load (`manifests.js`, the bundle 1.3 MB, one image); the printed `open:` URL of the `default` serve configuration also renders the Banner customizer; a TSX edit rebuilds in ~25 ms and reloads the page (websocket works, no Fast Refresh yet); ready in 0.85 s; port-in-use message and SIGINT/SIGTERM exit 0 checked. Left: HMR/Fast Refresh and several bundles per page (R5), terminal formatting/overlay filter (R14), project-change restarts (R17), deep library imports in `scriptResources` (R8), `config.json` externals (R9).

**R5 HMR and Fast Refresh.** `hot: true`, client `webSocketURL` `wss://localhost:<port>`, `@rspack/plugin-react-refresh` (SWC `react.refresh` + `development`, `overlay: false`, refresh only for `src`), React/react-dom/`react/jsx-runtime`/`react-dom/client` aliased to the project's copy (nested React copies, e.g. PnP's React 17, collapse), updates reaching the bundle entry (component class) → full page reload, several bundles on one page each with its own hot-update global (prototype `PerRuntimeHotUpdateGlobalPlugin`, or a `MultiCompiler` with one `uniqueName` per bundle; decide here by a short measurement: rebuild time, memory, complexity).
- Vite lessons: one tab only while checking HMR; HMR-boundary rules (mixed exports, services, ACE views) are the same, documented later; React 18 reports a render error 2–3 times.
- Prototype lessons: shared `uniqueName` → second bundle silently swallows every update; nested React 17 → "Invalid hook call".
- Acceptance: integration test with two bundles asserting distinct hot-update globals in the emitted runtime; **live:** spfx-rea TSX edit keeps SecondWebPart's counter (3/3), web part class edit reloads; spfx-bench edits in both bundles hot-update (BenchTree and BenchPnp).

### Phase 2: extensions and ACEs

| # | Task | Size | Status |
|---|---|---|---|
| R6 | Extensions: `serveConfigurations`, `--config`, extension query, warnings | M | ⬜ |
| R7 | Adaptive Card Extensions | M | ⬜ |

**R6 Extensions.** Serve configuration selection (unknown name warns and falls back to `default`), page order (named configuration `pageUrl` > `pageUrl` option > `default.pageUrl` > `initialPage`), query replacing the page's own query (`#hash` kept), `loadSPFX=true` + `customActions` / `fieldCustomizers` / form customizer parameters without `debug=true`, startup warnings (unknown ids, wrong extension kind, generator placeholders).
- Vite lessons: port `project/serveConfigurations.ts`, `server/debugUrl.ts`, `server/serveConfigurationWarnings.ts` with tests; the "match heft" decision applies unchanged.
- Acceptance: ported unit tests; **live:** Banner Application Customizer with `default` (together with web parts), Command Set with `--config commands`, Form Customizer (`feedback_EditForm`) render and hot-update. Field Customizer: module loads (SharePoint doesn't instantiate it on this tenant, also with heft).

**R7 ACEs.** `@microsoft/sp-adaptive-card-extension-base` as SPFx library external, JSON quick-view templates (Rspack's JSON support), images as `asset/resource` with absolute URLs on the dev server, dynamic `import()` chunks (quick views) loaded from `publicPath` with externals still declared on the entry `define` (no `AsyncComponentPlugin`), every ACE edit → page reload (views registered in `onInit`).
- Vite lessons: ACE notes in v1.24 README and `research/aces/`; the hosted workbench is retired on 2026-12-01, so use a test page (read mode for interaction).
- From R3: Rspack already hoists externals used only in `import()` chunks onto the entry `define` (spfx-rea ACE: `sp-property-pane`); verify at runtime here.
- Acceptance: integration test with an ACE fixture (JSON template, image, `import()` chunk); **live:** the `hello` ACE renders on a test page/workbench, quick view opens, card view edit reloads. View only.

### Phase 3: parity

| # | Task | Size | Status |
|---|---|---|---|
| R8 | SPFx libraries as AMD externals (complete) | M | ⬜ |
| R9 | `config.json` externals | M | ⬜ |
| R10 | Localization | M | ⬜ |
| R11 | Sass, CSS modules and theme tokens | L | ⬜ |
| R12 | SCSS and static-asset typings | S | ⬜ |
| R13 | tsconfig: `paths`, decorators, class fields, type-only checks | M | ⬜ |
| R14 | Error overlay and terminal noise | M | ⬜ |
| R15 | Browser errors in the terminal, readable load errors | M | ⬜ |
| R16 | Bare `require()` and AMD isolation: verify webpack semantics | S | ⬜ (expected ⏭️ for the Vite rewrites) |
| R17 | Options completion and project-change restarts | M | ⬜ |
| R18 | Extend file `fast-serve/rspack.extend.mjs` + `defineConfig` | L | ⬜ |
| R19 | Startup hint for heft webpack customizations | S | ⬜ |
| R20 | Agent skill for the extend file | S | ⬜ |
| R21 | Startup and rebuild performance | M | ⬜ |
| R22 | Docs and KB (user README, migration, HMR, troubleshooting) | M | ⬜ |
| R23 | Acceptance run (both projects, all component types) | M | ⬜ |
| R24 | Final benchmark | L | ⬜ |

**R8 SPFx libraries as AMD externals.** Every package with an SPFx library manifest (not only `@microsoft/sp-*`), plus `@microsoft/microsoft-graph-client` (in the model since R2, heft's non-standard external), and its known deep entry points as externals by exact request; manifest `scriptResources` with the library's id and version; libraries used only from async chunks still listed; React and react-dom deliberately bundled (development build), `react-dom/server` etc. resolved from the project.
- Vite lessons: the library detection of `project/libraries.ts` is reused. **Not needed with Rspack:** on-demand TLA facades, sync facades + per-chunk preload, facades in pre-bundling, export-name probing, `@microsoft/sp-lodash-subset` evaluation — webpack AMD externals import the module object and read names at use, like heft.
- Acceptance: integration test: imports of named, namespace and default exports from a library compile to property reads on the AMD dependency; manifest lists the right ids/versions; **live:** spfx-bench (PnP controls, `@pnp/sp`, Fluent) renders with the tenant's libraries (tenant 1.25 vs project 1.24.1 is fine).

**R9 `config.json` externals.** Entries `{ path, globalName?, globalDependencies? }` or URL strings → AMD externals; manifest `scriptResources` `{ type: 'path', path, globalName?, globalDependencies? }` like heft (URLs as is, local files served under `/dist/`); non-AMD scripts via `globalName` shim by sp-loader. Validation warnings (missing file, bad shape).
- Vite lessons: port `project/configExternals.ts` (validation); the webpack-like import semantics the Vite version emulated (`externals/externalImports.ts`) are native here (**not needed**); `export * from '<external>'` probably works under webpack (dynamic re-export) — verify instead of warning. CDN externals need the tenant's CSP to allow the host (heft limitation too).
- Acceptance: integration test with a local-file external and a URL external (manifest shape, AMD deps); **live:** one `config.json` external (e.g. a local UMD file) loads on the page, named import works.

**R10 Localization.** `*Strings` requests resolved to `loc/<locale>.js|.ts` with per-resource fallback to `en-us` (Rspack `resolve.alias` or a resolver plugin from the project model), AMD loc files (`define([], …)`) parsed by webpack's own AMD support, TS/ES loc files, the heft warning about ES loc files kept, string edits hot-update through the importing component.
- Vite lessons: port `localization/` decisions (fallback, warning text), not the virtual module mechanics; loc stays out of anything cached across restarts; `--locale` chosen at start.
- From R3: names are already aliased to the model's strings file (selected locale, `en-us` fallback) and AMD loc files parse (`amd: {}`); remaining: TS/ES loc files, the heft warning, HMR of string edits.
- Acceptance: integration test with AMD and TS loc files, `--locale de-de` and fallback; **live:** spfx-rea strings render, a string edit updates.

**R11 Sass, CSS modules, theme tokens.** `sass-loader` (`api: 'modern-compiler'`) with the project's Sass implementation (`sass-embedded`, else `sass`), `silenceDeprecations` from the merged `config/sass.json` (only that field; edit → restart in R17), `pkg:` URLs through Sass's `NodePackageImporter`, `~` imports (sass-loader handles them), CSS modules with SPFx class names (`<local>_<hash>`) and theme tokens (`"[theme:x, default:y]"`) resolved at runtime through `@microsoft/load-themed-styles`. Preferred implementation: the project's `@microsoft/sp-css-loader` (public loader package, what heft uses for `.css`; same class names and token handling) after `sass-loader`; fallback: Rspack's CSS modules + a small themed-styles runtime ported from the Vite version. Global `.scss`, plain `.css`, library `.module.scss.css` (PnP) through the same rules. CSS HMR: style module re-evaluates, component re-renders (old `<style>` may stay; check that it does not break visuals).
- Vite lessons: `styles/sassOptions.ts` (`NodePackageImporter` from the Sass package actually used, `pkg:` difference to heft documented), partials must never be compiled as roots (warmup bug), theme tokens resolve once per insert (no theme-change monitoring), `@pnp/spfx-property-controls` 3.13 CSS cut stays cut.
- From R3: the basic chain exists (`sass-loader` → project `sp-css-loader`, `silenceDeprecations`, `NodePackageImporter`, heft's `.css` rules, `.css` in `resolve.extensions`); remaining: class names equal to heft's (hash input differs today), `~` imports, library CSS check, CSS HMR.
- Acceptance: integration tests: class names match heft's for a fixture (compare with `heft build` output of the fixture or spfx-rea `lib/`), tokens become themed-style calls, `pkg:` and `silenceDeprecations` work; **live:** spfx-rea theme colours, SCSS edit applies without reload; spfx-bench Fluent/PnP styles.

**R12 Typings.** `temp/sass-ts` (`.module.scss.d.ts` via the project's `@rushstack/heft-sass-plugin` logic) and `temp/static-asset-ts` written at start and on add/change, like heft. Static assets (`.png`, `.svg`, …) as `asset/resource` with absolute dev-server URLs.
- Vite lessons: port `styles/scssTypings/` and `assets/` unchanged (bundler-free); typings start after the server listens.
- From R3: images/fonts are already `asset/resource` (`[name]_[contenthash][ext]`, absolute URL from `publicPath`), `.sprite.svg` as `asset/source`.
- Acceptance: ported unit tests; adding a `.module.scss` while serving creates its typing.

**R13 tsconfig.** `paths`/`baseUrl` (try Rspack `resolve.tsConfig` first; the Vite version needed its own resolver because a rig-extended `include` broke Vite's — if Rspack has the same gap, port `aliases/` as a resolver plugin or `resolve.alias` from the model), SWC options from tsconfig: `experimentalDecorators` → `legacyDecorator`, `emitDecoratorMetadata` → `decoratorMetadata`, `useDefineForClassFields`, target, JSX; `const enum`: per-file limit same as Oxc → keep the clear error/warning (port `transforms/constEnums` as a loader-agnostic check or warning on the compile error); type-only re-exports: `exportsPresence: 'auto'` + filter the "export … was not found" warnings like heft (**Vite's `typeOnlyNames` guard not needed**, SWC emits `typeof X === "undefined" ? Object : X` for decorator metadata like `tsc`). tsconfig change → restart (R17).
- Acceptance: integration tests with decorators (legacy, metadata, parameter), class fields without initializer, `paths` through a rig-style `extends`, a type-only re-export, a `const enum` from `.d.ts` (clear message).

**R14 Error overlay and terminal noise.** Rspack's client overlay for compile errors (`overlay: { errors: true, warnings: false }`), runtime errors in the overlay only for project code (the client's `runtimeErrors` filter function: project frames, not SharePoint's own errors), `--no-overlay` / `"overlay": false`; terminal: concise compile results (`errors` with file:line and code frame, warnings deduplicated, Sass deprecations silenced per `sass.json`), `infrastructureLogging` quiet, no dev-server banners, browser console logging `warn` (no `[HMR] Waiting for update signal…` noise).
- Vite lessons: overlay over SharePoint pages works; an overlay during page load → first edit reloads (check Rspack's behaviour); React reports render errors 2–3× → signature filter. **Not needed:** hiding Node's HTTP/2 status-message warning (`@rspack/dev-server` serves HTTPS over HTTP/1.1; the Chrome HTTP/2 stall is gone with it), Vite overlay-text hint.
- Acceptance: unit tests for the filter and terminal formatting; **live:** syntax error → overlay over the page, cleared after the fix; a thrown error in a component → overlay; SharePoint's own errors → no overlay.

**R15 Browser errors in the terminal, readable load errors.** A small runtime in each bundle (added as an entry) reports uncaught errors/rejections and `console.error` with a project frame to the server (`POST /@fast-serve/browser-errors` or the dev-server websocket if extensible), source-mapped with a code frame in the terminal; readable message when a bundle fails to load or a component export is missing (SharePoint otherwise shows `[object Object]`), e.g. via a wrapper in the entry; "server error" status so the page reloads after a fix.
- Vite lessons: port the frame rule, formatting and source-map logic of `browserErrors/`; only project code is forwarded. The AMD "Mismatched anonymous define()" hint is likely **not needed** (R16).
- Acceptance: unit tests; **live:** an error in a component's render shows in the terminal once with the right file:line.

**R16 Bare `require()` and AMD isolation.** Expected **not needed** as features: webpack resolves `require('<literal>')` at build time (CommonJS `module.exports`, ESM namespace, JSON, assets), and its parser handles `define`/UMD in dependencies itself, so the page's RequireJS never sees them (lodash's AMD branch sets `window._` exactly like heft). Task = regression tests only, plus documenting `amdPackages` as dropped.
- From R3: Rspack 2 parses AMD only when `amd` is set; the config sets `amd: {}` (webpack default behaviour). The regression tests must cover it.
- Acceptance: integration tests: `require` of a CommonJS package, an ESM package, JSON and an asset from `src`; a UMD dependency with an AMD branch and the full `lodash` build compile and run in a fake RequireJS page (no "Mismatched anonymous define()").

**R17 Options completion and restarts.** Final option set (`port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay`; anything Rspack-specific decided in R21, e.g. persistent cache), dev session that restarts the compiler/server on edits of `config/config.json`, `config/serve.json` (URL), `config/sass.json`, tsconfig (transform options, `paths`), `fast-serve/config.json`, `package.json` dependency changes; new/deleted components picked up.
- Vite lessons: port `devSession.ts` (a failing restart keeps the old server or exits clearly); which edits reload vs restart.
- Acceptance: unit tests for the restart rules; integration test: edit `config/sass.json` → restart.

**R18 Extend file.** Optional `fast-serve/rspack.extend.mjs` (`.js`, `.cjs`; `.mts`/`.ts` only if Node's type stripping is available — decide), exporting a Rspack `Configuration` or `defineConfig((context) => Configuration)`, sync or async; merged under fast-serve's config (arrays appended: `plugins`, `module.rules`, `resolve.alias`, `externals`…), protected keys (`entry`, `output.*`, `devServer.server/port/host`, `externalsType`, `mode`…) warn and are ignored; context: `root`, `port`, `publicPath`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `rspackVersion`; edits of the file and its local imports restart; add/delete restarts; broken file at start stops with the file name, broken edit keeps the server. Public entry `exports["."]`: `defineConfig` + types (`FastServeConfig`, `FastServeContext`, Rspack's `Configuration`).
- Vite lessons: port the structure of `viteExtend/` (files, context, guard, watch) and `publicApi.test.ts`; webpack customizations are never run automatically. Much simpler translation story: most heft webpack customizations (`DefinePlugin`, aliases, rules) can be pasted with `rspack.*` equivalents.
- Acceptance: unit + integration tests (merge, guard warnings, restart on change, broken file); public `.d.ts` emitted.

**R19 Webpack-customization hint.** At start, if `config/spfx-customize-webpack.js` or `config/webpack-patch.json` exists and there is no extend file: one hint naming `fast-serve/rspack.extend.mjs` and the docs.
- Vite lessons: port `project/webpackCustomizations.ts` and the hint text.
- Acceptance: unit test.

**R20 Agent skill.** `skills/fast-serve-rspack-config/SKILL.md` shipped in the package: translating a heft webpack customization into `fast-serve/rspack.extend.mjs` (webpack → `rspack.*` plugin names, webpack-only plugins that fail, what not to override).
- Vite lessons: structure of the Vite skill (v1.24 `skills/fast-serve-vite-config/`).
- Acceptance: the skill lists only what R18 supports; packed tarball contains it.

**R21 Performance.** Measure and choose: persistent cache (`cache: { type: 'persistent' }` under `node_modules/.cache/fast-serve`), `lazyCompilation` (imports/entries), `devtool` (cheap vs eval), `compress`, swc `target`, watch options; keep start < 3 s on spfx-bench and rebuild ≤ 0.3 s.
- Acceptance: numbers recorded in the KB (single runs, not the full harness); defaults chosen with reasons.

**R22 Docs and KB.** Full user README (requirements, install, usage, extensions, ACEs, options, externals, styles, tsconfig, extend file, errors, troubleshooting, limitations, dev vs production), migration notes (from `heft start`, from Vite fast-serve), HMR guide, VS Code debugging (source map paths for Rspack), KB reconcile.
- Acceptance: docs match the code (`--help`, option table); KB structure check clean.

**R23 Acceptance run.** Fresh tarball in copies of both projects: everything from the v1.24 acceptance list (web parts, theme tokens, TSX hot update with state, SCSS swap, class edit reload, Application Customizer and Form Customizer hot update, Command Set via `--config commands`, ACE, spfx-bench PnP + tree, `npm run build` still OK).

**R24 Final benchmark.** spfx-rea + spfx-bench with the same harness and method as [research/rspack](README.md) and [research/bundled-dev](../bundled-dev/README.md) (3 starts, cold load + 2 F5 per start, 3 edits per edit type, medians; one tab): Rspack fast-serve vs Vite fast-serve (`1.24.0-beta.3`), `heft start`, Vite `bundledDev`. Server start, edit → DOM (TSX leaf/mid, SCSS), state kept, cold/F5 load, requests, bytes, RSS, CPU per load.
- Acceptance: `research/rspack/BENCHMARK.md` with the tables, raw results outside the repo, KB references page updated.

## Vite-version items that are not needed with Rspack

| Vite item | Why not needed |
|---|---|
| AMD shim per bundle, ESM entry, `/@spfx/bundle`, `/@spfx/status` polling | SharePoint loads real AMD bundles; HMR runs inside them |
| on-demand TLA facades, CJS sync facades, per-chunk preload, facades in pre-bundling | AMD externals declared on the bundle's `define`, resolved by RequireJS before the bundle runs (like heft) |
| `externalImports` rewrite (named imports as property reads) | webpack's external module semantics already read properties at use |
| `require()` → import rewrite, scope analysis | webpack resolves `require` at build time |
| AMD isolation (`isolateAmd`), `amdPackages`, "Mismatched anonymous define" hint | webpack's parser handles `define` in dependencies; RequireJS never sees it (verified in R16) |
| type-only re-export guard (`typeOnlyNames`) | `exportsPresence: 'auto'` + warning filter, like heft |
| Vite CJS namespace-copy interop helper | webpack interop |
| library `.module.scss.css` via a separate compile path | the normal CSS rules apply (verify in R11) |
| pre-bundling, optimizer hash, warmup decisions | no pre-bundling; one compile at start |
| hidden HTTP/2 status-message warning | dev server uses HTTP/1.1 over TLS |
| Vite overlay-text hint | Rspack's overlay; own filter instead |

## Open questions (for the user)

1. CSS: use the project's `@microsoft/sp-css-loader` (exact heft class names and token handling, it is a public loader package already used by the Vite version for library CSS) or a fully own CSS-modules + themed-styles pipeline? Plan assumes `sp-css-loader`.
2. Extend file format: `.mjs` only, or also `.mts` (needs Node type stripping: unflagged from Node 22.18, SPFx allows ≥ 22.14)?
3. Several bundles: per-runtime hot-update global plugin (prototype, one compilation) vs `MultiCompiler` (one `uniqueName` per bundle, more memory)? Decided by measurement in R5 unless you prefer one.
4. Package identity: same name `spfx-fast-serve-helpers` with `-rspack.N` prerelease versions; is a publish of the Rspack line planned (dist-tag), or only local tarballs until the benchmark decides?
