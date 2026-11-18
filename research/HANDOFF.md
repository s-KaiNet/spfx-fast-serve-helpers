# Handoff: Vite dev server for SPFx 1.24 (Heft)

**Status (2026-11-18):** P0, P1 and the "Next" phase are done (§6); the package `spfx-fast-serve-helpers` `1.24.0-beta.0` is a zero-config `fast-serve` CLI that serves web parts, extensions and Adaptive Card Extensions. Nothing is pushed or published until the user says so. Open: VS Code F5 check, library components and the "Later" list (§6, §10).

Read this file first, then [README.md](../README.md) (user docs) and [research/migration.md](migration.md), [research/hmr.md](hmr.md), [research/debugging.md](debugging.md). Background research is in the topic folders next to this file (§2). The PoC, experiment files, raw results and captures were removed in commit `3ad70fe`; they are in git history at `dd4da8d`.

---

## 1. Goal and user decisions

**Goal:** a reusable npm package that replaces `heft start` **for development only**: fast server start, true HMR with React Fast Refresh, and SPFx components running inside a real SharePoint page. Production builds and `.sppkg` packaging stay on Heft (`heft build` / `heft package-solution`). It's the successor to spfx-fast-serve (webpack/gulp, SPFx ≤ 1.21) for Heft-based SPFx. This repo, branch `vite`.

| Topic | Decision |
|---|---|
| Scope | dev server only, never production builds |
| Package | `spfx-fast-serve-helpers`, version follows SPFx (`~1.24.0` serves SPFx 1.24.x); the installed SPFx `major.minor` is checked at start. 1.22/1.23 not supported (1.23 support researched: [research/spfx-1.23](spfx-1.23/README.md), not decided) |
| Shape | a zero-config CLI (`fast-serve`) that runs Vite programmatically; no user `vite.config`, no public Vite plugin entry (`package.json` `exports` only has `./package.json`) |
| Component types | web parts, extensions (Application Customizer, ListView Command Set, Field/Form Customizer) and ACEs. Library components: later |
| React | a **development copy of React** from the project's `node_modules` is OK (Fast Refresh needs it; the tenant ships production React) |
| Options | `port`, `pageUrl` (with `{tenantDomain}` = `SPFX_SERVE_TENANT_DOMAIN`), `locale`, `serveConfiguration` (`--config`/`--serve-config`), `overlay` (`--no-overlay`). Precedence: CLI flags > `config/fast-serve.json` > `config/serve.json` > defaults. HTTPS is automatic (SPFx dev cert), not an option |
| Extensions behaviour | match heft: unknown `--config` warns and falls back to `default`; the debug query replaces the page's own query; page order: named configuration `pageUrl` > `pageUrl` option > `default.pageUrl` > `initialPage` |
| Errors | Vite's error overlay is kept (works over SharePoint pages), for compile errors and uncaught runtime errors from project code; `console.error` goes to the terminal only |
| Not provided | CORS/allowedOrigins option, `debug` flag, eslint, `hotRefresh` flag (HMR always on), logging levels, type checking |
| Theme | tokens resolve once per style insert/hot update; no theme-change monitoring (switching the site theme needs a reload) |
| Vite bundled dev mode | **don't use** `experimental.bundledDev` |
| Startup warmup | **none** (2026-11-18): no entry-graph warmup and no Vite `server.warmup`; files compile when the page requests them. It only helped the first load of very large projects opened after the server was idle, slightly hurt when the page was opened right away, and compiled Sass partials (Vite `asset` graph entries) as root stylesheets ("Undefined variable"). Dependency pre-bundling unchanged; SCSS typings start when the server listens |
| Sass options | only `silenceDeprecations` from the merged heft `config/sass.json` (rig default: `mixed-decls`, `import`, `global-builtin`, `color-functions`; arrays appended through `extends`) → `css.preprocessorOptions.scss`/`.sass`; no field → nothing set. Editing `config/sass.json` restarts the server |
| `sp-*` loading | **on-demand facades with top-level await** (§4), chosen over preloading |
| Re-mount instead of page reload | later ([research/vite-serve-plan §4.1](vite-serve-plan/README.md#41-re-mount-web-parts-instead-of-reloading-the-page)) |
| Architecture | don't copy the old spfx-fast-serve-helpers structure; semantic modules, clear data flow (§8) |
| Process | discovery and approval before building; ask when scope is unclear. Don't commit, push or publish unless asked |

## 2. Where things are

| Path | What |
|---|---|
| `src/` | the package; tests next to the code (`*.test.ts`, vitest), fixtures in `test/fixtures/` |
| [README.md](../README.md), `research/{migration,hmr,debugging}.md` | user docs: options, extensions/ACEs, errors, troubleshooting, limitations; migration, HMR, VS Code debugging |
| [research/spfx-pipeline/](spfx-pipeline/index.md) | reverse-engineered SPFx 1.24 build → serve → runtime-loader contract. Start with `index.md` and [07-vite-integration-notes.md](spfx-pipeline/07-vite-integration-notes.md) |
| [research/vite-serve-plan/](vite-serve-plan/README.md) | the original plan (parity list, architecture proposal, easy-to-miss items, future improvements); its status columns are superseded by §6. [generate-spfx-webpack-config.cjs](vite-serve-plan/generate-spfx-webpack-config.cjs) gets heft's entries/externals from plain Node |
| [research/tla-externals/](tla-externals/README.md) | on-demand `sp-*` via top-level await (the design used in `externals/`) |
| [research/pnp-scss/](pnp-scss/README.md) | libraries importing `.module.scss` that ship only `.module.scss.css` (implemented in `styles/libraryCss/`) |
| [research/tsconfig-decorators/](tsconfig-decorators/README.md) | tsconfig not applied by Vite 8/Oxc: legacy decorators, class fields, `emitDecoratorMetadata`, `const enum` |
| [research/extensions/](extensions/README.md) | extensions and `serveConfigurations` |
| [research/aces/](aces/README.md) | Adaptive Card Extensions |
| [research/spfx-1.23/](spfx-1.23/README.md) | supporting SPFx 1.23 (discovery only) |
| [research/benchmark/](benchmark/README.md) | PoC-era Vite vs `heft start` benchmark; generator and CDP harness in `bench-project-tools/` |
| [research/library-components/](library-components/README.md) | library components: how classic spfx-fast-serve and heft do it, options, recommended one-command option B |

Test projects on this machine (not in the repo); both depend on `spfx-fast-serve-helpers` through `file:../gh/src/spfx-fast-serve-helpers/spfx-fast-serve-helpers-1.24.0-beta.0.tgz` (build with `pnpm build && pnpm pack`, then reinstall in the project; the current tarball is named after the version in `package.json`):
- `/home/sergei/Projects/spfx-rea`: SPFx 1.24.1, `npm run serve` = `fast-serve`, `config/fast-serve.json` `pageUrl` = the draft page below. Bundle `hello-world-web-part` holds HelloWorld (function component), SecondWebPart and the Banner Application Customizer (mixed bundle); separate bundles for a Command Set, a Field Customizer (`rating`), a Form Customizer (`feedback`) and an ACE (`hello`). `config/serve.json` has `default`, `banner`, `commands`, `rating` and `feedback_NewForm/EditForm/ViewForm` configurations. Leftovers from the PoC era: `tools/vite-plugin-spfx-serve/` and `vite.config.mjs` (unused; Vite is no longer a dev dependency there).
- `/home/sergei/Projects/spfx-bench`: generated big project (default 1000 modules; `node tools/generate.mjs --modules N`), web parts BenchTree and BenchPnp (Fluent UI, `@pnp/spfx-controls-react`, `@pnp/sp`), port 4341. `npm run fast-serve` runs the package; `npm run serve` is still the PoC-era `vite` with `vite.config.mjs` and `tools/vite-bench-workarounds.mjs`.

Tenant pages (`https://mastaq.sharepoint.com/sites/dev/`), drafts, never published:
- `SitePages/spfx-rea.aspx`: HelloWorld and SecondWebPart; the Banner customizer loads through the `default` configuration;
- `SitePages/spfx-bench.aspx`: both bench web parts;
- list `Lists/WMFAQ_Categories` for the Command Set / Field / Form Customizer configurations; ACEs were tested in the hosted workbench (`/_layouts/15/workbench.aspx`, retired on 2026-12-01), nothing saved.

## 3. How SPFx serve works (short) → [research/spfx-pipeline](spfx-pipeline/index.md)

- **Page bootstrap:** the SharePoint page loads `sp-loader`, which builds RequireJS. With `?debugManifestsFile=<url>&debug=true&noredir=true`:
  - the user sees an "Allow debug scripts?" prompt;
  - the loader fetches `manifests.js`, an AMD module with `getManifests()`, and registers those manifests;
  - CSP allows `localhost:*` scripts only when the debug params are present.
- **Extensions** use `loadSPFX=true` plus `customActions` / `fieldCustomizers` JSON or form customizer params, without `debug=true` (list pages fail with both).
- **Loading a component:** RequireJS `paths` + `map` per component; module id `<componentId>_<version>`; the `default` export (or `loaderConfig.exportName`) is the component class.
- **Framework packages:** `sp-*` packages and React come from the **page**, always the tenant's version (same major, ≥ requested). The test projects build on 1.24.1, the tenant serves 1.25.0. Production works the same way, so a newer tenant is fine; a project *newer* than the tenant fails in prod too, so the dev server only shows a clear message.

## 4. How fast-serve works

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**.

1. **Start** (`devServer.ts`): SPFx version check → options + project model (`config.json` bundles/components, manifests, `serve.json`, tsconfig, SPFx libraries in `node_modules`) → `vite.createServer()` with the feature plugins (`plugins.ts`). Prints the components and the page URL with the debug query. Dependencies are pre-bundled in the background; nothing else is compiled ahead (no warmup), files compile on the page's requests.
2. `GET /temp/build/manifests.js` → debug manifests: per component the source manifest (relative `./` icons made absolute) with `loaderConfig.entryModuleId` = bundle name, `scriptResources` = the bundle shim (`/@spfx/bundle/<bundle>.js`), `@microsoft/sp-loader` and `config.json` externals; `exportName` when a bundle has several components.
3. `GET /@spfx/bundle/<bundle>.js` → a classic AMD **shim** (runtime `componentShim.ts` + `libraryLoader.ts`). It defines each `<id>_<version>` through a RequireJS loader plugin that hands the component-scoped `require` to the library loader and `import()`s the bundle entry. On failure it puts a readable message in the web part's error box (instead of SharePoint's `[object Object]`), and polls `/@spfx/status` to reload after the next file change.
4. `/@spfx/entry/<bundle>` → generated ESM entry: imports the `browserErrors` runtime and `@vitejs/plugin-react/preamble`, re-exports each component (`export * as <exportName>` or `export *` + `default`), and `import.meta.hot.accept(() => location.reload())` for updates that reach the component class.
5. **SPFx libraries** (`@microsoft/sp-*` and any package with an SPFx library manifest): ESM importers get a facade doing `await loadComponentById(id, version)` (top-level await); `require()` importers in pre-bundled deps get a sync facade plus one `await preloadLibraries([...])` per chunk. The same facades run in `optimizeDeps.rolldownOptions.plugins`, so pre-bundled deps share the page's instances. `config.json` externals use the same mechanism through the scoped RequireJS `require`.
6. **Localization:** `*Strings` → virtual modules from `loc/<locale>.js|.ts` (kept out of pre-bundling).
7. **Styles:** SPFx-style CSS module names; Vite's `updateStyle` import is swapped for the `themedStyles` runtime, which resolves `"[theme:x, default:y]"` from `window.__themeState__.theme` while Vite still owns the `<style>` tags (CSS HMR works). Library `.module.scss.css` files are compiled with `@microsoft/sp-css-loader`. `temp/sass-ts` and `temp/static-asset-ts` typings are regenerated like heft. Sass gets `silenceDeprecations` from the merged `config/sass.json` (project model).
8. **Transforms:** project tsconfig decorator/class-field options passed to Oxc, `DEBUG`/`NODE_ENV` defines, `require()` → hoisted imports, type-only names and const enum checks.
9. **Errors:** browser errors with a project frame go to the terminal (source-mapped, code frame); uncaught errors/rejections also go to Vite's overlay on the reporting page. React and react-dom come from the project in their development build; Fast Refresh keeps state.

## 5. Performance

**PoC-era benchmark** ([research/benchmark](benchmark/README.md), 2026-11-15/16, the PoC plugin with bench workarounds, before the on-demand facades and the P1 warmup, which was later removed). 1000 generated modules, live on the tenant, medians of 3. The page loaded **all** ~1000 TS files + 122 SCSS, a worst case.

| | heft start | Vite (PoC) |
|---|---|---|
| server start | 22.6 s | 0.3 s warm / 1.24 s cold |
| edit → DOM updated | ~4–5 s (rebuild + reload) | 34–61 ms |
| cold page load | 3.3 s | 8.5 s |
| F5 reload | 2.6 s | 5.8 s |
| localhost requests | 6 | 1180 |
| server memory | 1.2–1.3 GB | ~0.45 GB |

- 250 modules: heft F5 2.4 s, Vite 3.6 s; Vite edits 23–34 ms. SharePoint alone is ~1.1–1.4 s of every load.
- The bottleneck is the browser fetching/evaluating ~1200 modules, not transforms (a warm crawl takes 0.4 s, a load still 6.3 s).
- PoC HelloWorld: Vite ready in ~0.3 s vs heft cold ~5.7 s; TSX edit → in-page update < 250 ms.
- Heft bugs seen (not ours): `heft start` 1.24.1 writes port 4321 into `manifests.js` even when `serve.json` sets another port; heft's auto-reload only worked on the first edit with two web parts on a page.

**Package numbers (P1 perf runs and acceptance, spfx-bench; the full harness was not re-run):**
- warmup rework (Vite `server.warmup` off, entry graph warmed after the first pre-bundling, SCSS typings after it): cold start → optimizer done 4.5 s → 1.9 s. The entry-graph warmup was **removed** on 2026-11-18 (see §1 "Startup warmup");
- after the removal (N7, spfx-bench, single runs, Load-debug-scripts click → both web parts rendered): page opened right after start 6.0 s / 5.6 s, opened after 20 s idle 4.2 s, reload with a warm server 4.4–4.6 s; `ready in` ~400 ms;
- cold BenchPnp load 6.97 s → 4.48 s (PoC ~3.8 s); the cause was warmup flooding plus unfiltered pre-bundle plugin hooks;
- N5 acceptance: 32 spfx-bench loads, median 5.5 s, no hangs;
- on-demand facades: the web part was ready ~300 ms sooner than with the PoC preload; ~1 ms per already-loaded package; the per-chunk preload turned 154 ms of sequential awaits into 52 ms.

## 6. Status

Legend: ✅ done · ⏭️ skipped / cut by the user · ⬜ open.

### Done
| Phase | What (details in the research) |
|---|---|
| P0 | web part manifest/shim/ESM entry/HMR/Fast Refresh; several components per bundle (`exportName`); on-demand `sp-*` facades (TLA, CJS sync facade, per-chunk preload, also in pre-bundling); library `.module.scss.css` via `sp-css-loader`; loc resources out of pre-bundling; React dedupe; `require()` → imports; type-only re-export detection; `.module.scss` typings; clear load/version errors; defines; Rushstack certificate manager; startup warmup; options; SPFx version check; install without `--legacy-peer-deps` (Vite and `@vitejs/plugin-react` are package dependencies, React from the project); project tsconfig options applied to Oxc (#17) |
| P1 | tsconfig `paths` aliases (own resolver: Vite's `resolve.tsconfigPaths` ignores a rig-extended `include`); static-asset typings; theme polling removed; `config.json` `externals`; TS loc files; docs (migration, HMR, VS Code `launch.json`); cleanups; warmup timing (warmup later removed) and PnP load speed (§5); second web part on a page; decorator / `const enum` docs |
| Next | browser errors in the terminal only for project code (`browserErrors/`, replaces `server.forwardConsole`); `const enum` / decorator checks with clear errors (`transforms/constEnums`, `transforms/typeOnlyNames`, missing-export hint in the shim); extensions with `serveConfigurations` ([research/extensions](extensions/README.md)); runtime errors in Vite's overlay + `overlay` option; ACEs ([research/aces](aces/README.md)); startup warmup removed; `config/sass.json` `silenceDeprecations` in Vite's Sass compile; Sass `pkg:` URLs (Sass's `NodePackageImporter` from the Sass package Vite loads, `styles/sassOptions.ts`) |

Acceptance (N5, 2026-11-17, fresh tarball, live on mastaq; the overlay work was verified live on 2026-11-18): spfx-rea web parts (render, `[vite] connected.`, theme tokens, TSX hot update with state, SCSS swap, class edit → reload), Application Customizer and Form Customizer (hot update), Command Set via `--config commands`, ACE in the hosted workbench (render, quick view, card view edit → reload), spfx-bench PnP + tree. `npm run build` OK in both projects.

### Open / known issues
| Item | Status |
|---|---|
| VS Code: verify the [research/debugging.md](debugging.md) `launch.json` with F5 in real VS Code | ⬜ |
| Field Customizer is never instantiated by SharePoint on this tenant, with `heft start` too (module loaded, `onInit` not called) | ⬜ tenant issue |
| occasional page-load hang | ⏭️ skipped. Only reproduced before `207e9ef` (8 of 64 loads); a stall inside Chrome on the HTTP/2 connection (server sent `react-dom` in ~100 ms, Chrome never got headers). If it returns, serving HTTP/1.1 is the likely fix (Vite 8 always uses HTTP/2 with HTTPS) |
| locale switch, theme setter hook, `@pnp/spfx-property-controls` 3.13 already-hashed CSS | ⏭️ cut |

Heft facts found on the way: `config.json` `externals` go into the manifest as `{ type: "path", path, globalName?, globalDependencies? }` (URLs as is, local files copied to `dist/`); loc files: TypeScript `define([], …)` works, `export default` builds but breaks under RequireJS, `export =` fails with TS1203. `fast-serve` lists every external in every manifest (one shared RequireJS `require`).

### Later (not planned now)
- library components ([research/library-components](library-components/README.md): recommended option B, one command serving linked libraries from source, effort M);
- SPFx 1.23 support ([research/spfx-1.23](spfx-1.23/README.md));
- ngrok/tunnel; Docker/WSL; Teams hosts;
- re-mount instead of reload ([research/vite-serve-plan §4.1](vite-serve-plan/README.md#41-re-mount-web-parts-instead-of-reloading-the-page)).

## 7. Easy-to-miss gotchas

- **HMR boundaries:** files that export components *and* other values skip Fast Refresh → update bubbles up → reload; services imported by the component class reload the page; module-level side effects (`initializeIcons`, PnPjs singletons) re-run. ACE card/quick views are classes registered in `onInit`, so every ACE edit reloads. Advise `onInit` for setup and component-only files ([research/hmr.md](hmr.md)).
- In dev all bundles share one ESM graph (one module instance); in prod each bundle has its own copy ([research/migration.md](migration.md)).
- An overlay opened during the page load makes the first edit a full reload (Vite's rule). React 18 reports one render error 2–3 times; a signature filter shows it once. Chrome can report an earlier column for an undefined name in JSX children.
- The debug URL is sticky in `sessionStorage["spfx-debug"]`: opening the page without the query in the same tab retries localhost (CSP error).
- The dev cert must be trusted (`npx heft trust-dev-cert`); Chrome/Edge Local Network Access prompt (the server sends `Access-Control-Allow-Private-Network`).
- Vite needs `server.origin` (absolute asset URLs) and `optimizeDeps.entries` (no index.html); `appType: 'custom'`.
- Watch-ignored: `lib`, `lib-commonjs`, `lib-esm`, `lib-dts`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`.
- `@microsoft/sp-lodash-subset` ships an AMD blob in its "ESM" folder (export names are read by evaluating it).
- Oxc's automatic tsconfig lookup must stay off: the rig's `importsNotUsedAsValues: "remove"` would keep type-only imports. Plugins in `optimizeDeps.rolldownOptions.plugins` need hook filters, or pre-bundling gets ~2× slower.
- `const enum` from `.d.ts` or dependencies can't work file by file; `fast-serve` explains it (README "Limitations").
- Heft's `WebpackConfigurationGenerator.generateWebpackConfigurationAsync({serveMode:true, production:false})` returns entries + externals in ~0.7 s without a build (not used by `src/`, useful for checking parity).

## 8. Architecture

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**. Entry points: `cli.ts` (bin) → `runCli.ts` (args) → `devServer.ts` (`startDevServer()`) → `plugins.ts` (composes feature plugins); `context.ts` holds the `ServeContext` passed to every module.

| Module | Owns |
|---|---|
| `config/` | options, precedence, serve configuration and page selection |
| `project/` | SPFx facts, plain Node, **no Vite imports**: bundles/components, manifests, `serve.json` configurations, SPFx libraries, `config.json` externals, loc files, tsconfig (`extends`, `paths`), SPFx version. Cached, `invalidate(file)` |
| `manifests/` | debug `manifests.js`, dev icon URLs |
| `loader/` | AMD shim per bundle, ESM entries, `/@spfx/status`, last server error |
| `externals/` | SPFx library and `config.json` external facades (TLA + CJS), in normal and pre-bundle pipelines |
| `aliases/` | tsconfig `paths`/`baseUrl` resolver |
| `assets/` | static-asset typings (`temp/static-asset-ts`) |
| `localization/` | `*Strings` modules |
| `styles/` | CSS modules naming, themed styles, `config/sass.json` `silenceDeprecations` and the `pkg:` importer → Sass options, library CSS (`libraryCss/`), SCSS typings (`scssTypings/`) |
| `transforms/` | tsconfig → Oxc options, defines, `require()` → imports, `typeOnlyNames/`, `constEnums/` |
| `browserErrors/` | browser errors → terminal and overlay, overlay hint |
| `server/` | HTTPS cert, port/origin, debug URL, serve configuration warnings, watch, dedupe, project-change reloads/restarts (no startup warmup) |
| `runtime/` | browser code as TS (shim, library loader, themed styles, browser errors, shared contracts) |
| `utils/` | small helpers (JSONC, paths, errors, runtime source loading, Vite and Heft helpers) |

A feature is one module returning Vite plugin(s) (each contributing its own config via `config()`), plus its browser runtime and tests.

## 9. Live debugging with agent-browser (how everything was verified)

Use the [`spfx-debugging` skill](../.agents/skills/spfx-debugging/SKILL.md): headless Chrome on the saved, logged-in profile (`scripts/start-chrome.sh`), agent-browser over `--cdp`, debug URLs for web parts/extensions/ACEs, checks, the HMR test, pitfalls and cleanup. Configuration is only in the git-ignored `.env` in the repo root (keys in [.env.example](../.env.example)): `SPFX_DEBUG_BROWSER_PROFILE`, `SPFX_DEBUG_PAGE_URL`, `SPFX_DEBUG_WORKBENCH_URL`, `SPFX_DEBUG_LIST_URL`, `SPFX_DEBUG_CHROME`, `SPFX_DEBUG_CDP_PORT`, `SPFX_DEBUG_DEV_SERVER_PORT`, `SPFX_SERVE_TENANT_DOMAIN`.

- Prereqs: `fast-serve` (or heft) on `https://localhost:<port>` in the test project (reinstall the tarball after changing `src/`); dev cert in `~/.rushstack/`.
- One Chrome per profile, never delete lock files, never a fresh profile; the user signs in via `agent-browser dashboard start`. View only: don't save or publish tenant pages.
- Raw CDP for timings, network and console capture: the benchmark harness ([browser.mjs](benchmark/bench-project-tools/tools/bench/browser.mjs), [lib.mjs](benchmark/bench-project-tools/tools/bench/lib.mjs)).

## 10. Next steps (ask the user before starting)

1. Verify the VS Code `launch.json` with F5 in real VS Code.
2. Library components: finish the research in `library-components/`, then agree the design.
3. Decide on SPFx 1.23 support ([research/spfx-1.23](spfx-1.23/README.md): one package for `>=1.23 <1.25`, ~2–3 days).
4. Before publishing: rebuild the tarball, re-run the acceptance list (§6) in both test projects, optionally re-run the benchmark harness against the package.
