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
| R1 | CLI and options | M | ⬜ |
| R2 | Project model | M | ⬜ |
| R3 | Rspack compile: entries, TS via SWC, AMD output, SPFx library externals (minimal) | L | ⬜ |
| R4 | HTTPS dev server, debug `manifests.js`, debug URL, web parts on the page | L | ⬜ |
| R5 | HMR and React Fast Refresh | L | ⬜ |

**R1 CLI and options.** `fast-serve` bin, `runCli` (`-p/--port`, `--page-url`, `--locale`, `--config`/`--serve-config`, `--no-overlay`, `-h`, `-v`), `fast-serve/config.json` (JSONC) with precedence flags > file > `config/serve.json` > defaults, `{tenantDomain}` = `SPFX_SERVE_TENANT_DOMAIN`, warning for the old `config/fast-serve.json`, SPFx `major.minor` check at start (1.24.x only), logger with `[fast-serve]` prefix, exit codes, SIGINT/SIGTERM shutdown.
- Vite lessons: port `config/options.ts`, `runCli.ts`, `project/spfxVersion.ts`, `utils/jsonc.ts` almost unchanged (bundler-free); `amdPackages` is dropped (see R16). Help text without Vite wording.
- Acceptance: unit tests for parsing, precedence, invalid port, old-file warning, version check (ported from v1.24); `fast-serve --help/--version` from the packed tarball.

**R2 Project model.** Plain Node, no Rspack import: bundles and components from `config/config.json`, entry `./lib/**.js` → `./src/**.ts(x)`, source manifests (JSON with comments), `localizedResources` (`lib/` → `src/`), `serve.json` (port, `initialPage`, `serveConfigurations`), SPFx libraries in `node_modules` (any package with an SPFx library manifest: id, version), `config.json` externals, tsconfig (`extends` incl. rig, `paths`, compiler options), merged `config/sass.json`, cache + `invalidate(file)`.
- Vite lessons: port `project/` (multi-component bundles, rig `extends`, `sass.json` `extends` arrays appended, missing-source errors) with its tests and fixtures.
- Acceptance: ported unit tests on fixtures; a model snapshot of spfx-rea and spfx-bench copies (bundles, components, libraries, configurations) matches what heft's config would produce (compare with the dumped heft config from the prototype run, read only).

**R3 Rspack compile.** Our config builder: one entry per SPFx bundle (single component: the source entry; several: a generated entry module `export * as <exportName>` per component, written to `temp/fast-serve/` or a virtual module, decided here), `output.library.type: 'amd'` (anonymous `define`, like heft), `externalsType: 'amd'`, `output.publicPath` = `https://localhost:<port>/dist/`, `output.hashFunction: 'xxhash64'`, `builtin:swc-loader` for `.ts/.tsx` (classic JSX runtime; decorator/class-field options from tsconfig come in R13, R3 uses the SPFx rig defaults), `resolve.extensions`, `mode: 'development'`, `devtool` (start with `cheap-module-source-map`), `cache: true`, watch ignores (`lib`, `lib-*`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`), `DEBUG`/`NODE_ENV` via `rspack.DefinePlugin`. Minimal externals: the `@microsoft/sp-*` packages the project model finds (full rules in R8), React bundled from the project.
- Vite lessons: React stays the project's development copy (Fast Refresh); DefinePlugin values as in `transforms/defines.ts`.
- Prototype lessons: Rspack 2 panics on `md5`; `library.type` (not `libraryTarget`); externals need `externalsType: 'amd'` or they become `module.exports = …`; `exportsPresence` defaults to `error` in Rspack 2 → `auto`.
- Acceptance: integration test compiles a fixture with one single-component and one multi-component bundle; asserts the AMD dependency list, that externals are not bundled, and that `exportName` exports exist; compile of the spfx-rea copy without errors.

**R4 Dev server, manifests, debug URL.** `@rspack/dev-server` over HTTPS with the SPFx dev certificate (`@rushstack/debug-certificate-manager`, same as heft), `host: 'localhost'`, CORS + `Access-Control-Allow-Private-Network` headers and an `OPTIONS` handler, bundles from memory under `/dist/`. Our `GET /temp/build/manifests.js` (AMD module with `getManifests()`), rendered on request from the project model + compilation facts: per component the source manifest, `loaderConfig.internalModuleBaseUrls` = `https://localhost:<port>/dist/`, `entryModuleId` = bundle name, `scriptResources` (bundle path + the externals the bundle really uses: `{type:'component', id, version}`, `@microsoft/sp-loader`), `exportName` for multi-component bundles, dev icon URLs (relative `./` icons made absolute). Ready banner with components and the page URL + debug query (`?debugManifestsFile=…&debug=true&noredir=true`). Nothing else from the project root is served (heft serves the whole root). Port taken → clear error.
- Vite lessons: port `manifests/` (rendering and icon URLs, not the shim parts), `server/debugUrl.ts`, `server/certificate.ts`; "Allow debug scripts" and CSP rules unchanged; manifests always `no-store`; heft's 4321 port bug must not exist (we render the URL ourselves).
- Acceptance: unit tests for manifest rendering (single/multi bundle, icons, externals list); integration test: dev server on a free port, `manifests.js` evaluates in a fake RequireJS `define`, `/dist/<bundle>.js` is served with the CORS/PNA headers. **Live:** spfx-rea HelloWorld + SecondWebPart render, theme tokens visible (needs R11 for SCSS; if not yet, use a plain-CSS fixture or accept unstyled), no console errors from our bundles.

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

**R8 SPFx libraries as AMD externals.** Every package with an SPFx library manifest (not only `@microsoft/sp-*`) and its known deep entry points as externals by exact request; manifest `scriptResources` with the library's id and version; libraries used only from async chunks still listed; React and react-dom deliberately bundled (development build), `react-dom/server` etc. resolved from the project.
- Vite lessons: the library detection of `project/libraries.ts` is reused. **Not needed with Rspack:** on-demand TLA facades, sync facades + per-chunk preload, facades in pre-bundling, export-name probing, `@microsoft/sp-lodash-subset` evaluation — webpack AMD externals import the module object and read names at use, like heft.
- Acceptance: integration test: imports of named, namespace and default exports from a library compile to property reads on the AMD dependency; manifest lists the right ids/versions; **live:** spfx-bench (PnP controls, `@pnp/sp`, Fluent) renders with the tenant's libraries (tenant 1.25 vs project 1.24.1 is fine).

**R9 `config.json` externals.** Entries `{ path, globalName?, globalDependencies? }` or URL strings → AMD externals; manifest `scriptResources` `{ type: 'path', path, globalName?, globalDependencies? }` like heft (URLs as is, local files served under `/dist/`); non-AMD scripts via `globalName` shim by sp-loader. Validation warnings (missing file, bad shape).
- Vite lessons: port `project/configExternals.ts` (validation); the webpack-like import semantics the Vite version emulated (`externals/externalImports.ts`) are native here (**not needed**); `export * from '<external>'` probably works under webpack (dynamic re-export) — verify instead of warning. CDN externals need the tenant's CSP to allow the host (heft limitation too).
- Acceptance: integration test with a local-file external and a URL external (manifest shape, AMD deps); **live:** one `config.json` external (e.g. a local UMD file) loads on the page, named import works.

**R10 Localization.** `*Strings` requests resolved to `loc/<locale>.js|.ts` with per-resource fallback to `en-us` (Rspack `resolve.alias` or a resolver plugin from the project model), AMD loc files (`define([], …)`) parsed by webpack's own AMD support, TS/ES loc files, the heft warning about ES loc files kept, string edits hot-update through the importing component.
- Vite lessons: port `localization/` decisions (fallback, warning text), not the virtual module mechanics; loc stays out of anything cached across restarts; `--locale` chosen at start.
- Acceptance: integration test with AMD and TS loc files, `--locale de-de` and fallback; **live:** spfx-rea strings render, a string edit updates.

**R11 Sass, CSS modules, theme tokens.** `sass-loader` (`api: 'modern-compiler'`) with the project's Sass implementation (`sass-embedded`, else `sass`), `silenceDeprecations` from the merged `config/sass.json` (only that field; edit → restart in R17), `pkg:` URLs through Sass's `NodePackageImporter`, `~` imports (sass-loader handles them), CSS modules with SPFx class names (`<local>_<hash>`) and theme tokens (`"[theme:x, default:y]"`) resolved at runtime through `@microsoft/load-themed-styles`. Preferred implementation: the project's `@microsoft/sp-css-loader` (public loader package, what heft uses for `.css`; same class names and token handling) after `sass-loader`; fallback: Rspack's CSS modules + a small themed-styles runtime ported from the Vite version. Global `.scss`, plain `.css`, library `.module.scss.css` (PnP) through the same rules. CSS HMR: style module re-evaluates, component re-renders (old `<style>` may stay; check that it does not break visuals).
- Vite lessons: `styles/sassOptions.ts` (`NodePackageImporter` from the Sass package actually used, `pkg:` difference to heft documented), partials must never be compiled as roots (warmup bug), theme tokens resolve once per insert (no theme-change monitoring), `@pnp/spfx-property-controls` 3.13 CSS cut stays cut.
- Acceptance: integration tests: class names match heft's for a fixture (compare with `heft build` output of the fixture or spfx-rea `lib/`), tokens become themed-style calls, `pkg:` and `silenceDeprecations` work; **live:** spfx-rea theme colours, SCSS edit applies without reload; spfx-bench Fluent/PnP styles.

**R12 Typings.** `temp/sass-ts` (`.module.scss.d.ts` via the project's `@rushstack/heft-sass-plugin` logic) and `temp/static-asset-ts` written at start and on add/change, like heft. Static assets (`.png`, `.svg`, …) as `asset/resource` with absolute dev-server URLs.
- Vite lessons: port `styles/scssTypings/` and `assets/` unchanged (bundler-free); typings start after the server listens.
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
