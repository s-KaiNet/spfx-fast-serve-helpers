# Research: Vite 8 `experimental.bundledDev` for fast-serve

Date: 2026-11-19. Branch `v1.24`, package `1.24.0-beta.3` (the same tarball as the [Rspack research](../rspack/README.md)), Vite 8.3.8, Rolldown 1.2.19, `@vitejs/plugin-react` 6.3.0. All work was done on copies in `/var/tmp/bundleddev-research/` (`rea` = spfx-rea, `bench` = spfx-bench, both copied from the Rspack research copies). The originals and this repo's `src/` were not touched. The prototype is a single `fast-serve/vite.extend.mts` file (section 3), with no patch to the built package.

## Short answer

- **bundledDev works inside a real SharePoint page with today's fast-serve plus about 70 lines of `vite.extend.mts` hacks.** Verified live: both spfx-rea web parts and the Banner Application Customizer, theme tokens, Fast Refresh with state kept, SCSS module hot updates, a full reload on web part class edits, Vite's build error overlay (it clears after the fix), lazy `import()` (the ACE property pane), `config.json` externals, a UMD dependency and a project `require()`. spfx-bench (two bundles, PnP, Fluent) also renders and hot-updates in **both** bundles with no extra fix. The Rspack prototype needed a fix for that because it had two runtimes on one page.
- **Numbers (medians, section 4).** On spfx-bench: 10 localhost requests instead of 1181, cold load 3.58 s (fast-serve 8.52 s, Rspack 3.75 s, heft 3.56 s), F5 2.89 s (6.04 / 2.48 / 2.61 s). Edits take **36–50 ms** (fast-serve 36–69 ms, Rspack 226–263 ms). The first bundle is ready after 3.7 s (`ready in` is printed after 0.8 s); RSS is about **1.0 GB** (fast-serve 0.45 GB, Rspack 0.6 GB). On spfx-rea all modes load in 2.2–3.2 s.
- **What breaks** (section 2): the bundle entry and shim URL, the React Fast Refresh preamble, the `/@id/__x00__…` virtual URLs, **`require()` of an SPFx library from CommonJS code (`REQUIRE_TLA` build error)**, the type-only-names guard (it relies on `transformRequest`), browser error forwarding (stack frames now point into bundles), readable build errors in the shim, and SCSS typing updates (Vite stops watching the project root). The manifests, ESM library facades, `config.json` externals, AMD isolation, `require()` rewrites, localization, themed styles and the HMR client keep working.
- **Recommendation:** for a bundled mode, bundledDev is a better candidate than Rspack. It gives the same page-load gain, keeps fast-serve's 30–60 ms edits, uses one engine, and reuses most of fast-serve's plugins. The cost is the experimental API (it changed between 8.1 and 8.3) and roughly 2× the memory. Add it as an opt-in `--bundled` mode with an exact Vite pin. Effort is **M, about 5–8 days**. Before that, spend 1–2 days on the real 500+-request project. Keep unbundled as the default.

---

## 1. Q1: what `experimental.bundledDev` does in Vite 8.3.8

Read in the shipped source (`vite/dist/node/chunks/node.js`: `BundledDev`, `memoryFilesMiddleware`, `triggerLazyBundlingMiddleware`, `DevEnvironment`, `_createServer`; `dist/client/bundledDevClient.mjs`) and in the docs and issues.

| Topic | Behaviour in 8.3.8 |
|---|---|
| Status | Experimental since 8.1 ("formerly Full Bundle Mode"). The option's JSDoc calls it "highly experimental". Phase 1 (basic CSR) has shipped, Phase 2 (complete CSR, HMR refactor, `hotUpdate`, globs) is in progress, Phase 3 (proper CSS HMR) was planned for 2026-11-12, and SSR has no date ([8.1 announcement](https://vite.dev/blog/announcing-vite8-1), [design doc and roadmap](https://github.com/vitejs/vite/discussions/22746)) |
| How code is served | Rolldown's dev engine (`dev()` from `rolldown/experimental`) builds the `input` entries into memory (`watch.skipWrite`). Files are served by `memoryFilesMiddleware` from `assets/[name].js` (entries) and `assets/[name]-[hash].js` (shared chunks), with source maps (`output.sourcemap: true`, `minify: false`). Several entries give shared chunks, not one file per entry. Vite's `transformMiddleware`, `serveStaticMiddleware` and `serveRawFsMiddleware` are **not installed**, so per-file URLs (`/src/…`, `/@id/…`, `/node_modules/…`) return 404 |
| Entry | Top-level `input` (new in 8.x) or `build.rolldownOptions.input`. The default is `index.html` and fails with `UNRESOLVED_ENTRY` when it is missing. `preserveEntrySignatures` defaults to `false`, so **a JS entry loses its exports** unless it is set |
| Lazy bundling | On by default (`devMode.lazy`). Only dynamic `import()` targets are deferred; they are compiled on demand. **All entries are built at startup** |
| HMR | Since the client-side HMR refactor ([vite#22883](https://github.com/vitejs/vite/pull/22883)) the server sends `bundled-dev-update` (changed ids + patch URL). The browser computes the boundaries from its runtime graph, imports `/hmr_patch_N.js` and re-runs the accepting modules. `import.meta.hot.accept` counts only if it actually ran, and `invalidate()` stays in the browser (option JSDoc). If no boundary is found it does a full reload; after an HMR-stage error the next access triggers a full rebuild. Plugin `hotUpdate`/`handleHotUpdate` are not supported yet |
| HMR client | `/@vite/client` is turned into an external `/bundledDevClient.mjs`, which loads `/@rolldown/experimental-runtime.mjs` and defines `__rolldown_runtime__`. For backend integration the entry has to import `/@vite/client` itself ([design doc comment](https://github.com/vitejs/vite/discussions/22746)). The client still exports `updateStyle`/`removeStyle` |
| Fast Refresh | `@vitejs/plugin-react` 6.3 disables its virtual `@vitejs/plugin-react/preamble` module in bundled dev and injects the preamble only through `transformIndexHtml`. Without HTML, each component throws "can't detect preamble". The refresh wrapper itself works |
| Plugins | `resolveId`/`load`/`transform` run inside Rolldown, with `options.kind` (`require-call`, `import-statement`, …). Output hooks (`renderChunk`, …) run for the initial bundle only, **not for HMR patches**. Plugins must call `this.addWatchFile`. `server.transformRequest`, `environment.transformRequest`, `pluginContainer` and `moduleGraph` do not describe the bundle ("transforming a single module is not possible"). `waitForRequestsIdle` does nothing |
| `configureServer`/middlewares | Run as usual, before Vite's own middlewares (`memoryFiles`, `/@vite/lazy`). Custom middlewares (manifests, shim, status, externals) work |
| `optimizeDeps` | **No dependency optimizer** (`disableDepsOptimizer`). Dependencies go through the normal plugin pipeline and Rolldown's CommonJS handling. `optimizeDeps.rolldownOptions.plugins` is ignored |
| Watcher | `server.watcher` (chokidar) **no longer watches `root`**, only config dependencies, env files and the public dir. Module files are watched by Rolldown |
| CSS / Sass / CSS modules | Compiled by Vite's CSS plugins into JS modules that call `updateStyle` and self-accept. In this test `.module.scss` edits hot-updated without a reload (31–36 ms). Phase 1 feedback reported full reloads for `.module.css` in 8.1.x ([discussion #22747](https://github.com/vitejs/vite/discussions/22747)), so this changed between minors |
| Source maps | Bundle maps (`assets/*.js.map`) and HMR patch maps live in memory. DevTools resolves them; Vite's error formatter maps through them |
| Initial build not done | HTML gets a "Bundling in progress" fallback page. JS entries get **404** until the first output exists |

## 2. Q2: fast-serve features under bundledDev

How it was switched on: `experimental.bundledDev: true` in `vite.extend.mts` is ignored, as designed, because the guard warns and fast-serve's own `config()` sets it back to `false`. **A plugin `config` hook with `order: 'post'` gets through**, and the guard does not report it (its `changedByPlugins` check does not look at `experimental`).

| Feature | Result | Why / what was needed |
|---|---|---|
| Bundle entry `/@spfx/entry/<bundle>` (virtual) | ⚠️ needs rework | It has to be a Rolldown `input`, it needs `preserveEntrySignatures: 'strict'` (otherwise the shim sees an empty module), and it must import `/@vite/client`. The served file is `/assets/<bundle>.js` and imports `./<chunk>.js`. The prototype redirects `/@spfx/entry/*` with a 302, so the module's base URL becomes `/assets/`. A rewrite broke the relative chunk imports. Inputs are fixed when the server starts (bundle changes in `config.json` need a restart) |
| AMD shim `/@spfx/bundle/<bundle>.js` + library loader | ✅ works | Middleware, unchanged. The `entryPath` should point at `/assets/<bundle>.js` |
| React Fast Refresh | ⚠️ needs rework | The prototype loads the preamble code itself for `\0@vitejs/plugin-react/preamble` (plugin-react returns `''` in bundled dev). It then worked: state kept 3/3 on both projects |
| `/@id/__x00__…` URLs (themed styles, browser errors) | ⚠️ needs rework | The CSS transform rewrote the `updateStyle` import to `/@id/__x00__virtual:fast-serve/themed-styles` → `UNRESOLVED_IMPORT`. The prototype resolves `/@id/__x00__X` back to `\0X`. A real fix imports the bare virtual id. The shim's separate `import()` of the browser-errors URL returns 404 (harmless, the entry imports it too) |
| Themed styles / CSS modules / Sass | ✅ works | Theme tokens resolved (`color: var(--bodyText)`, no `[theme:` left), one `<style>` per file, SCSS hot update 29–51 ms |
| `sp-*` library facades (ESM, top-level await) | ✅ works | The facades are bundled as modules with top-level `await window.__spfxFastServe.loadLibrary(…)` (5 sequential awaits in the spfx-rea entry, libraries already on the page) |
| `require('@microsoft/sp-…')` from CommonJS (dependencies) | ❌ blocked as-is → needs rework | `[REQUIRE_TLA] This require call is not allowed because the imported file "\0spfx-library:@microsoft/sp-core-library" contains a top-level await`. Unbundled fast-serve solves this with a sync CJS facade plus a per-chunk preload, but only inside the dependency optimizer, which bundled dev does not run. The prototype maps `require-call` to the existing `\0spfx-library-cjs:` facade. That works only because the library was already loaded. A real fix: route `require-call` to the CJS facade and preload every library the build references before the entry runs (shim or entry prelude). `renderChunk` does not run for HMR patches, so a patch that adds a new library needs a reload |
| `config.json` externals | ✅ works | A local external (`globalName`) imported with ESM in project code: value read correctly (tested with a temporary external) |
| `require()` → import rewrite (project code) | ✅ works | `require('contoso-umd')` in a `.tsx` |
| AMD isolation | ✅ works | A test UMD package took its CommonJS branch, no `window` global. The main `isolateAmd` transform matches `node_modules/*.js` ids, so it also runs inside the bundle. The pre-bundle copy is ignored |
| Type-only re-export / metadata guard (`typeOnlyNames`) | ❌ breaks the build → needs rework | It calls `environment.transformRequest`, which in bundled dev returns the untransformed TS. es-module-lexer then fails (`Parse error` on spfx-bench `src/gen/index.ts`). The prototype removes the plugin. A bundler reports missing exports itself (`MISSING_EXPORT`), so the guard would become a formatter for Rolldown's error |
| `const enum` checks, decorators, tsconfig → Oxc, defines | ✅ works (as far as tested) | Normal transform hooks. Defines take effect, although the bundle still contains both React builds (dev is used) |
| Localization `*Strings` | ✅ works | Virtual modules with `addWatchFile` |
| Manifests `temp/build/manifests.js` | ✅ works | Middleware, unchanged |
| HMR client on the SharePoint page | ✅ works (with the entry import) | `[vite] connected.` over `wss://localhost:<port>`. Patches and lazy chunks load from localhost because `import('/hmr_patch_N.js')` resolves against the client module's URL. One Rolldown runtime serves all bundles, so the two-bundle HMR problem from the Rspack research does not occur |
| Class edit → reload | ✅ works | The entry's `import.meta.hot.accept(() => location.reload())` still runs |
| Build error overlay | ✅ works | Rolldown error with a code frame over the SharePoint page. It clears on the next successful HMR, without a reload |
| Browser errors → terminal / runtime overlay | ⚠️ needs rework | Frames now point to `assets/<bundle>.js`, which `referencesProjectCode` treats as project code. Dependency errors (PnP telemetry "Failed to fetch") were forwarded and opened the overlay during load, and **Vite's "overlay present on first update → reload" rule then turned every spfx-bench edit into a full reload**. Measurements therefore use `--no-overlay`. Mapping uses `moduleGraph` transform maps, which are empty here. Needs mapping through the bundle source maps and its own classification |
| Readable load errors in the shim (`/@spfx/status`) | ⚠️ needs rework | Build errors do not pass through the middleware chain, so the shim only says "failed to fetch dynamically imported module". The status file revision comes from `server.watcher`, which no longer sees `src/` changes, so "reload after the next file change" never fires. Requests before the first build finishes get a 404 |
| SCSS typings (`temp/sass-ts`) / static-asset typings | ⚠️ needs rework | Generated at startup, but **not updated on edit**: `server.watcher` does not watch `root` in bundled dev. Fix: add `src` to the watcher or use the `watchChange` hook |
| Project model changes (`config.json`, manifests, tsconfig) | ✅ probably works | Those files are added to the watcher explicitly. Not tested in bundled dev |
| Lazy `import()` (ACE property pane) | ✅ works | `import("./HelloPropertyPane-<hash>.js")` → on-demand chunk from localhost. Tested by calling `loadPropertyPaneResources()` on the bundle's class in the page; no ACE was rendered in the workbench |
| `vite.extend.mts` guard | ⚠️ | It warns about `experimental.bundledDev` and `build`, but a post `config` plugin overrides both silently. If a bundled mode is added, it should own these keys |

## 3. The prototype

`/var/tmp/bundleddev-research/vite.extend.bundled.mts` (copied to `<project>/fast-serve/vite.extend.mts`). One plugin:

1. `config` (`order: 'post'`): `experimental.bundledDev: true`, `input` = one `/@spfx/entry/<bundle>` per `config.json` bundle, `build.rolldownOptions.preserveEntrySignatures: 'strict'`.
2. `configResolved`: removes `fast-serve:type-only-names`.
3. `configureServer`: `/@spfx/entry/<bundle>` → 302 to `/assets/<bundle>.js` (`Cache-Control: no-store`).
4. `resolveId` (`pre`): `/@id/__x00__X` → `\0X`; `@microsoft/sp-*` with `kind: 'require-call'` → `\0spfx-library-cjs:` (added after the timed runs; neither project has such a require).
5. `load` (`pre`): the React Refresh preamble for `\0@vitejs/plugin-react/preamble`.
6. `transform` (`pre`) on `\0spfx-entry:*`: prepend `import '/@vite/client';`.

The first try showed each problem in turn: `UNRESOLVED_ENTRY index.html` → unresolved themed-styles URL → "can't detect preamble" → empty entry namespace → working page. On spfx-bench the type-only guard parse error came next, then edits that reloaded the page (the overlay rule).

## 4. Q3: numbers

Same machine and method as the [Rspack research §1](../rspack/README.md#1-setup-and-method): Intel i7-7500U (2c/4t), 22 GB, Node 24.21.0, agent-browser Chrome 153 headless on the saved profile, one tab. Harness `/var/tmp/bundleddev-research/harness/measure.mjs` (the Rspack harness plus a `bundled` kind). Per server: 3 starts, each with 1 cold load (empty cache) and 2 F5. In the last start, 3 edits per edit type. Medians. Failed loads are excluded and noted. Ports 4420 (rea) and 4421 (bench).

- **fast-serve and bundledDev were measured again in this session.** The heft and Rspack columns come from the Rspack research (same machine and harness, measured a few hours earlier the same day).
- bundledDev "ready" = `/assets/<bundle>.js` returns 200 (initial build done). `ready in` is printed earlier (0.86 s / 0.78 s) and given in brackets.
- bundledDev runs used `--no-overlay` (see the browser-errors row in section 2). It does not affect timings, only the reload-on-first-update rule.

### spfx-rea (small, one page bundle of 3 components; 5 bundles built)

| Metric | heft start | fast-serve (Vite unbundled) | **Vite bundledDev** | Rspack prototype |
|---|---|---|---|---|
| Server start → ready | 7.4 s | 0.80 s | **1.12 s** (`ready in` 0.86 s) | 1.75 s |
| Edit TSX → DOM | 2.47 s (reload) | 30 ms | **65 ms** | 103 ms |
| Edit SCSS → DOM | 2.17 s (reload) | 54 ms | **31 ms** | 102 ms |
| Edit TSX, state kept | no | 27 ms, yes 3/3 | **38 ms, yes 3/3** | yes 3/3 |
| Cold load → both web parts | 2.50 s | 3.19 s | **2.86 s** | 2.55 s |
| F5 | 2.24 s | 2.24 s | **2.17 s** | 1.99 s |
| localhost requests per load | 5 | 32 | **11** | 5 |
| bytes from localhost (cold) | 133 KB | 3.4 MB | **1.2 MB** | 1.4 MB |
| Server RSS ready / end / peak | 0.64 / 0.50 / 0.65 GB | 0.14 / 0.20 / 0.24 GB | **0.35 / 0.33 / 0.36 GB** | 0.31 / 0.32 / 0.33 GB |
| Server CPU per cold load | | 0.55 s | **0.10 s** | |

### spfx-bench (1000 generated modules, two bundles, PnP + Fluent)

| Metric | heft start | fast-serve (Vite unbundled) | **Vite bundledDev** | Rspack prototype |
|---|---|---|---|---|
| Server start → ready | 23.4 s | 0.78 s | **3.72 s** (`ready in` 0.78 s) | 2.80 s (0.9 s with warm persistent cache) |
| Edit leaf TSX → DOM | no auto reload (two bundles) | 69 ms (rerun: 75 ms) | **43 ms** | 263 ms |
| Edit mid TSX (57 descendants) | same | rerun: **36 ms** (first run: 3/3 never reached the DOM, see notes) | **50 ms** | 257 ms |
| Edit SCSS | same | 65 ms | **36 ms** | 226 ms |
| Cold load → both web parts | 3.56 s | 8.52 s (2 of 3) | **3.58 s** | 3.75 s |
| F5 | 2.61 s | 6.04 s | **2.89 s** (5 of 6) | 2.48 s |
| localhost requests per load | 6 | 1181 | **10** | 6 |
| bytes from localhost (cold) | 774 KB (gzip) | 15.8 MB | **7.2 MB** (no compression; refetched on every F5, no 304s) | 9.5 MB |
| Server RSS ready / end / peak | 1.18 / 0.85 / 1.20 GB | 0.14 / 0.42 / 0.45 GB | **1.02 / 0.83 / 1.04 GB** | 0.57 / 0.59 / 0.59 GB |
| Server CPU per cold load | 0.2 s | 5.4 s | **0.18 s** | 0.08 s |

Notes:
- Each mode had one failed load on spfx-bench: fast-serve's first cold load and bundledDev's second F5 in run 1. Both were RequireJS "Load timeout for modules: spfx-fast-serve-loader:bench-tree-web-part!…" after a ~90 s stall, which looks like the known occasional page-load hang ([HANDOFF §6](../HANDOFF.md#open--known-issues)). One more bundledDev F5 took 5.3 s and is included in the median.
- fast-serve's mid-TSX edit failed 3/3 in the timed run ("hmr update" logged, DOM unchanged, no reload). A manual check and a 1-start rerun (35/36/42 ms) both worked, so it is treated as a harness/page glitch, not a fast-serve regression. The cause was not found.
- The fast-serve and heft numbers match the earlier [benchmark](../benchmark/README.md) and the Rspack research (8.4–8.5 s / 5.6–6.0 s / 1181 requests).
- bundledDev's start grows with project size because every entry is built up front (3.7 s for 1000 modules + PnP + Fluent; `ready in` stays below 1 s, but a page opened earlier gets a 404 entry).
- spfx-bench HMR in bundledDev applies a tiny patch file, which is why its edits are faster than unbundled fast-serve's (no import-chain revalidation).

## 5. Q4: recommendation

| | Vite unbundled (today) | Vite bundledDev | Rspack (prototype) |
|---|---|---|---|
| Page load at 1000 modules | 8.5 s cold / 6.0 s F5, 1181 req | **3.6 s / 2.9 s, 10 req** | 3.75 s / 2.5 s, 6 req |
| Edit → DOM | 30–70 ms | **30–65 ms** | 100–260 ms |
| Start (first bundle) | **0.8 s, flat** | 1.1–3.7 s, grows with size | 1.8–2.8 s (0.9 s warm cache), grows |
| Memory (bench) | **0.45 GB** | 1.0 GB | 0.6 GB |
| Two bundles on a page | works | **works natively** (one runtime) | needed a plugin fix |
| Engines to maintain | 1 | **1** (same plugins, mode switch) | 2 |
| Maturity | stable | **experimental**, changed between 8.1 and 8.3 | stable, but depends on heft internals |
| Effort to production | done | **M, ~5–8 days** | M–L, ~8–12 days |

**Recommendation: keep unbundled as the default and add bundledDev as an opt-in `--bundled` (experimental) mode. Drop the Rspack mode plan unless the spike on the real project fails.** bundledDev reaches the heft and Rspack page-load level while keeping fast-serve's edit loop, and most of fast-serve still applies. Rspack's main advantage was reusing heft's webpack config, but that brings two engines and heft internals with it. Rspack stays the fallback if bundledDev gets stuck (for example on `REQUIRE_TLA`-style limits in a real dependency tree) or churns too much.

What fast-serve would have to redo for bundledDev (estimate, including tests and docs):

| Work | Size |
|---|---|
| Mode switch: `input` from bundles, `preserveEntrySignatures`, shim `entryPath` → `/assets/<bundle>.js`, entry imports `/@vite/client`, restart when bundles change, guard owns `experimental`/`input`/`build` | S (1 d) |
| React preamble in the entry (plugin-react's bundled-dev path depends on HTML) | S (0.5 d) |
| Bare virtual ids instead of `/@id/__x00__` URLs (styles, browser errors, shim) | S (0.5 d) |
| CommonJS `require()` of SPFx libraries and `config.json` externals: CJS facade on `require-call` + preload of all referenced libraries before the entry (from the initial build's module ids); reload when a patch adds a new library | M (1–1.5 d) |
| Browser errors: bundle-aware frame classification and source mapping through memory source maps; overlay noise | M (1–1.5 d) |
| Shim status: build errors from bundled dev (needs `environment.bundledDev`, an internal-ish API), 404 before the first build → wait/retry, file revision without `server.watcher` on `root` | S–M (1 d) |
| Watcher: SCSS/asset typings and status on `src` changes (`watcher.add(src)` or `watchChange`) | S (0.5 d) |
| `typeOnlyNames` → format Rolldown's `MISSING_EXPORT` with the existing hint, or turn it off in bundled mode | S–M (0.5–1 d) |
| Tests (many server tests use `transformRequest`/`moduleGraph`), live acceptance list for both modes, docs | M (1.5–2 d) |

Risks:
- **Experimental API churn**: the HMR protocol moved from server to client in 8.x (payloads and events renamed), `input` is new, `hotUpdate` support and CSS HMR are still on the roadmap, and plugin-react's handling is HTML-only. Mitigation: pin Vite and Rolldown exactly for the bundled mode (fast-serve already ships them as dependencies) and run the bundled acceptance tests on every bump.
- Memory roughly 2× unbundled on spfx-bench (1.0 GB); start time grows with project size, because all entries are built eagerly.
- Two plugin behaviours to keep in sync: output hooks do not run for patches, and the module graph and `transformRequest` APIs are not available.
- Unbundled-only features have to stay correct in both modes (two test matrices).

## 6. What could not be verified

- No real 500+-request project, only spfx-rea and spfx-bench. Real CommonJS-heavy dependency trees may hit more `REQUIRE_TLA` cases or Rolldown CommonJS interop differences from the dependency optimizer.
- Not tested live in bundledDev: Command Set, Field Customizer, Form Customizer, an ACE rendered in the workbench (only the lazy property pane import was exercised), library components, locale switching, `fast-serve/config.json` changes, tsconfig changes, long sessions and memory growth, Vite's runtime overlay with correct classification.
- The `REQUIRE_TLA` workaround depends on load order (the library was already loaded). The preload design is untested.
- 3 starts per server on one machine; heft and Rspack numbers were not re-measured (same day, same harness).
- The fast-serve mid-TSX failure in the first timed spfx-bench run was not explained (the rerun passed).
- Compression (`7.2 MB` on spfx-bench) and 304 revalidation of bundle files were not looked at.

## 7. Reproduce

`/var/tmp/bundleddev-research/` (temporary, not in this repo):
- `rea/`, `bench/`: project copies (ports 4420/4421 in `config/serve.json`, fast-serve beta.3 from the Rspack copies). `rea/config/config.json` and the `HelloWorld.tsx` probe were restored after the externals/CJS/UMD probe. `rea/node_modules/contoso-umd`, `contoso-cjs` and `rea/externals/contoso-greeting.js` are test fixtures.
- `vite.extend.bundled.mts`: the prototype. `harness/measure.mjs --kind=fast|bundled [--project= --port= --page= --profileFile=]`, `harness/all.sh`.
- `results/*.json|log`: raw runs (`bench-fast-rerun.*` = the 1-start rerun, `smoke-*` = first smoke runs; `smoke-bench-bundled` is the run with the overlay-induced reloads).

Sources: [Vite 8.1 announcement](https://vite.dev/blog/announcing-vite8-1), [bundled dev design doc and roadmap](https://github.com/vitejs/vite/discussions/22746), [Phase 1 feedback](https://github.com/vitejs/vite/discussions/22747), [client-side HMR PR #22883](https://github.com/vitejs/vite/pull/22883), [plugin-owned runtimes and CSS HMR in full bundle mode](https://github.com/vitejs/vite/discussions/22226), [server.watch docs](https://vite.dev/config/server-options), and Vite 8.3.8 / plugin-react 6.3.0 / Rolldown 1.2.19 sources in `node_modules`.
