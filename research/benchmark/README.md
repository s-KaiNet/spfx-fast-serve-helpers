# Benchmark: unbundled Vite dev server vs `heft start` on a large SPFx solution

> Experiment files, logs and captures referenced here were removed from the repo in a cleanup; they are in git history at commit `dd4da8d`.

Date: 2026-11-15/16. Bench project: [/home/sergei/Projects/spfx-bench](bench-project-tools/) (full project: `/home/sergei/Projects/spfx-bench`) (not in this repo).
Vite mode: the normal unbundled dev server, **no `experimental.bundledDev`**, with the unmodified PoC plugin
tools/vite-plugin-spfx-serve imported from this repo.

**Short answer.** At 1000 modules, unbundled Vite is far better for the edit loop: it starts in 0.3 s instead of 22.6 s, and an edit shows up in 30–60 ms instead of about 5 s.
Page loads are worse: 8.5 s cold and 5.8 s on F5, against 3.3 s and 2.6 s for heft. Most of that time goes to the browser working through the module request waterfall (about 1180 requests, 15.7 MB). Vite's transforms take only 2.6 s cold and 0.4 s warm, and SharePoint's own share (about 1.3 s) is the same for both servers.
There is also a reliability problem to fix before wider use: about 13 % of Vite page loads stalled on one optimized-dep chunk, and the web parts then failed with RequireJS's 90 s timeout (section 5).

The 2000-module browser runs were **dropped at the user's request**, because they were too slow. Only the 2000 server-start and crawl numbers from earlier remain, as a side note.

---

## 1. Setup

| | |
|---|---|
| Machine | Intel i7-7500U (2 cores / 4 threads, 2.7 GHz), 22 GB RAM, Ubuntu (Linux 7.0.0-43) |
| Runtime | Node 24.21.0, npm 11.19.0 |
| Browser | Chrome 153.0.8010.36 `--headless=new`, profile `contoso-sharepoint`, 1400×1000 |
| Toolchain | SPFx 1.24.1, @rushstack/heft 1.3.2, webpack 5.105.4, TypeScript 5.8.3, Vite 8.3.8 (Rolldown), @vitejs/plugin-react 6.x |
| Extra deps | `@pnp/spfx-controls-react` 3.25.0 (latest stable), `@pnp/sp` 4.23.0, `@microsoft/sp-http` 1.24.1 |
| Page | https://contoso.sharepoint.com/sites/dev/SitePages/spfx-bench.aspx (new page, id 14, **draft**), with both bench web parts |
| Noise | Another agent thread used the same machine at the same time (load average 0.7–2.4). Numbers are medians of 3 runs (5 for Vite start). Individual runs are in `spfx-bench/results/*.json` |

### Bench project
- Copied from spfx-rea: package.json, lockfile, config, rig, tsconfig, eslint. It has a **new solution id** `6849c3e6-3391-47e7-bead-b41e14fbc1bd`, a new feature id, and new web part ids:
  - BenchTree `fd161a6d-a8ea-4165-a7f4-7fbe0352c77e`;
  - BenchPnp `be07a142-c46e-44f5-87cb-e8a32d1530d9`.
  
  `serve.json` port is 4341. Both `heft build` and `heft build --clean` pass with 0 warnings (about 25 s for 1000 modules).
- Generator `tools/generate.mjs --modules N [--barrels on|off]` writes `src/gen` and `bench-targets.json`. For N = 1000:
  - 846 function components in a tree of depth 9 (level sizes 1/2/5/10/21/46/98/211/452);
  - 120 utility modules that import each other;
  - 30 shared widgets behind a barrel;
  - 3 barrels and a types module;
  - 122 `.module.scss` files using a shared `_tokens.scss` with theme tokens (`"[theme:themePrimary, default: …]"`);
  - Fluent UI deep imports (`@fluentui/react/lib/Stack|Icon|Toggle|Label|Text`).
- Web parts:
  - **BenchTree** renders the whole tree.
  - **BenchPnp** renders `ListView` and `PeoplePicker`, makes a `spfi().using(SPFx(context))` call (web title + lists), a raw `SPHttpClient` call, and uses Fluent `MessageBar` / `PrimaryButton`.
  
  Verified live in both servers: "Web: dev (29 lists)".
- Vite config: `vite.config.mjs` uses `spfxServe({ pageUrl })` from `../spfx-rea/tools/...` plus the bench-only workarounds in `tools/vite-bench-workarounds.mjs` (section 6).

### Method (tools in `spfx-bench/tools/bench/`)
- `start.mjs`: spawn → port listening → "ready".
  - **heft**: `GET /temp/build/manifests.js` returns 200. webpack-dev-middleware holds the request until the first compilation finishes.
  - **Vite**: listening. With `--force`, also wait until `.vite/deps/_metadata.json` is written.
  - Cold = `heft start --clean` / `vite --force`.
- `run.mjs` + `browser.mjs`: raw CDP over port 9351, a new tab per server start.
  - `sessionStorage['spfx-debug']` is pre-set, so the "Allow debug scripts?" prompt is skipped.
  - **Rendered** = `performance.now()` written in a `useEffect` of each web part's root (`__benchTreeReady` / `__benchPnpReady`); the value reported is the later of the two. All 846 `[data-node]` elements must be present.
  - **SP canvas** = first time both `.ControlZone`s are in the DOM (MutationObserver).
  - Network data comes from CDP Network events.
  - Load types:
    - "cold" = fresh server + `Network.clearBrowserCache` (SharePoint's assets are cold too);
    - "F5" = `Page.reload` with the cache kept;
    - "warm server, empty cache" = Vite already served the page once, then the cache is cleared and the page reloaded.
- Edits: the harness rewrites a token in the file and records the moment the DOM shows it (MutationObserver plus a 50 ms poll). Targets:
  - leaf = `l8/Node620.tsx`;
  - mid = `l4/Node18.tsx` (57 descendants);
  - scss = `l8/Node623.module.scss` (outline colour, checked with `getComputedStyle`).
- `crawl.mjs`: browser-free HTTP/2 crawl of Vite's module graph, starting from both entries and requesting each new import as soon as it's found. It isolates the server-side transform cost from the browser.

## 2. Results (median)

### 2.1 1000 modules (barrels on)

| Metric | heft start | Vite (unbundled) |
|---|---|---|
| Server start, cold (`--clean` / `--force`) | **22.6 s** (port listens at 17.3 s) | **1.24 s** (listens at 0.34 s + deps optimize) |
| Server start, warm | 22.6 s (no gain without `--clean`: tsc watch + webpack start from scratch) | **0.30 s** |
| Cold page load → both web parts rendered | **3.28 s** | **8.46 s** (tree); PnP web part 4.2 s |
| …SharePoint until `manifests.js` is requested | 1.11 s | 1.30 s |
| …last localhost response | 1.64 s | 7.9 s |
| localhost requests / bytes on the wire | 6 / 774 KB (gzip) | 1180 / 15.7 MB (no compression, inline source maps) |
| Warm reload (F5) | **2.64 s** | **5.78 s** (304s: 11–12.6 MB still transferred) |
| Warm server + empty browser cache | — | 6.32 s |
| Edit leaf `.tsx` → DOM | **6.5 s** measured (rebuild 1.05 s + reload)¹ | **61 ms** (Fast Refresh) |
| Edit mid-tree `.tsx` → DOM | 5.8 s (rebuild 1.3 s)¹ | **34 ms** |
| Edit `.module.scss` → DOM | 5.6 s (rebuild 0.97 s)¹ | **49 ms** |
| Server RSS: at ready → after page loads (peak) | 1.14–1.28 GB (peak 1.30 GB) | 0.15 GB → 0.42–0.45 GB (peak 0.48 GB) |
| Server CPU | 36 CPU-s per start; ~3 CPU-s per edit; 0.2 per page load | 2.6 CPU-s per `--force` start; **5.3 CPU-s per cold page load** (transforms); 0.6 per warm reload; 0.05 per edit |

¹ Heft edits: the harness waits for heft's `build finished`, gives webpack-dev-server's live reload 1.5 s, then presses F5 itself. With two bundles on the page, the auto reload happened only on the first edit; after that the HMR client logged "App is up to date" and nothing changed. The measured numbers therefore include up to 1.5 s of that wait. A realistic figure is **about 4–5 s** (rebuild about 1 s + full page reload about 2.6–3 s). The one clean automatic reload measured 4.95 s.

### 2.2 SharePoint alone (same page, no debug manifests)

| | cold (empty cache) | F5 |
|---|---|---|
| Both canvas zones in the DOM | 1.40 s | 1.20 s |
| Requests / bytes | 341 / 118 KB | 333 / 55 KB |

So SharePoint's own work takes about **1.1–1.4 s** of every load. That is 35–40 % of a heft load and about 15 % of a cold Vite load. In debug mode, SharePoint requests `manifests.js` at 1.1–1.3 s with either server.

### 2.3 Where Vite's cold 8.5 s goes (1000 modules)

| Phase | Time | Evidence |
|---|---|---|
| SharePoint boot until `manifests.js` | ~1.3 s | same as heft and as the no-debug canvas time |
| Module waterfall until the last localhost response | ~6.6 s | 1180 requests, graph depth 13 (crawl) |
| …of which Vite transforms (server CPU) | ~2.1 s extra on a cold server | cold 8.46 s vs warm-server/empty-cache 6.32 s; crawl: cold 2.56 s vs warm 0.43 s for the whole graph |
| …the rest: browser fetching and evaluating 1180 ES modules | ~4.5 s | even with transforms cached, leaf modules wait 0.7–1.5 s per request in the browser; the crawler (no browser) pulls the same graph warm in 0.43 s |
| React render after the last module | ~0.5 s | |

**Bottleneck: the browser's request waterfall.** That is the per-module request, parse and link cost of about 1200 ES modules. Transforms come second (about 2 s, only on a cold server), and SharePoint is a fixed 1.3 s for both servers.

### 2.4 Cheap Vite mitigations (1000 modules, each measured separately)

| Variant | Cold load | F5 | Warm server, empty cache | Notes |
|---|---|---|---|---|
| Baseline | 8.46 s | 5.78 s | 6.32 s | |
| `server.warmup.clientFiles: ['./src/**/*.ts', './src/**/*.tsx']` | **7.19 s** (−1.3 s) | — | — | the server needs ~3.1 s of CPU after "ready" to pre-transform; RSS rises from 0.15 to 0.49 GB before the first request |
| Browser cache (304s), i.e. F5 vs empty cache | — | 5.78 s | 6.32 s | −0.5 s. Optimized deps (`?v=`) come from the cache; every `src` module still revalidates (1180 requests, about 11 MB still sent) |
| Barrels off (`--barrels off`: direct imports instead of `utils/index.ts` and `shared/index.ts`) | 8.95 s | 5.63 s | 6.23 s | no measurable effect here: 21 fewer requests, and every re-exported module is used anyway. Barrels only cost much when they pull in modules the page doesn't use |
| `optimizeDeps.holdUntilCrawlEnd: false` | 8.46 s (n=1) | 5.71 s | 6.50 s | no speed change, and it doesn't fix the stall (section 5) |

### 2.5 250 modules

| Metric | heft start | Vite |
|---|---|---|
| Server start cold / warm | 13.6 s / 13.7 s | 0.80 s / 0.31 s |
| Cold page load | 2.99 s | 5.50 s (only 1 of 3 runs succeeded: 2 stalls) |
| F5 | 2.36 s | 3.58 s |
| Warm server + empty cache | — | 3.98 s |
| localhost requests / bytes | 6 / 705 KB | 339 / 11.3 MB (deps dominate) |
| Edit leaf / mid / scss | 4.7 / 5.1 / 4.9 s (rebuild 0.5–0.9 s)¹ | **34 / 33 / 23 ms** |
| Server RSS | ~0.95–1.0 GB | 0.15 → 0.30–0.35 GB |

### 2.6 Side note: 2000 modules (server only; browser runs dropped at the user's request)

| | heft | Vite |
|---|---|---|
| Start cold / warm | 34.8 s / 34.8 s (RSS 1.4 GB) | 1.91 s / 0.30 s |
| Crawl of the whole graph (no browser), cold / warm | — | 4.44 s / 0.65 s; 2299 requests, depth 14, 21 MB |

Crawl scaling (cold / warm / requests):
- 250: 1.14 s / 0.29 s / 336;
- 1000: 2.56 s / 0.43 s / 1177;
- 2000: 4.44 s / 0.65 s / 2299.

Server-side cost grows linearly and stays small. The browser waterfall is what grows (about 3.6 s F5 at 250, 5.8 s at 1000). By extrapolation, not measured, expect roughly 9–11 s F5 at 2000.

## 3. Interpretation

- **Is unbundled Vite fast enough at 1000 modules?** For the inner loop, yes, clearly: the server starts instantly and edits apply in 30–60 ms while React state is kept, against 4–6 s full reloads with heft.
  - For **page loads, no**: 2.2× slower cold (8.5 vs 3.3 s) and 2.2× slower on F5 (5.8 vs 2.6 s). At 250 modules the gap is smaller (3.6 vs 2.4 s F5).
  - A developer who mostly edits pays about 3 s extra per manual reload and saves about 5 s per edit and about 20 s per server start. A developer who reloads often, for example when testing property panes or page navigation, feels the slower loads.
- **Bottleneck = request waterfall in the browser**, not transforms and not SharePoint. Evidence:
  - with transforms cached on the server, the load is still 6.3 s;
  - a browser-free crawl of the same graph takes 0.43 s;
  - SharePoint's share is 1.1–1.4 s for both servers.
- **Memory/CPU**: Vite uses 3–4× less RAM (0.45 vs 1.2–1.3 GB) and almost no CPU while idle or editing. Its CPU cost moves to the first page load (about 5 CPU-s at 1000 modules).

## 4. Recommendations
1. Keep the unbundled dev server as the default for edit-heavy work. Tell users to **rely on HMR and avoid F5**: no edit type in this bench needed a reload.
2. Turn on `server.warmup` for `src` in the package defaults. It costs about 3 s of background CPU after start and saves about 1.3 s on the first load. *(Superseded: the package first used an entry-graph warmup instead, then dropped warmup entirely on 2026-11-18, because it only helped a page opened after the server was idle and compiled Sass partials as root stylesheets; see [HANDOFF §1](../HANDOFF.md#1-goal-and-user-decisions).)*
3. Reduce the number of modules the browser must fetch. Not measured here; these are the next things to try:
   - pre-bundle stable internal code. Move shared/util folders into a workspace package so `optimizeDeps` bundles them, or consider `optimizeDeps.include` for linked packages;
   - avoid deep import fan-out from leaf components;
   - keep Fluent imports as deep `lib/*` paths. That already works with pre-bundling: 37 optimized dep files at every scale.
4. Barrels: no change needed for barrels that only re-export modules the page uses anyway. Look out for barrels that pull in unused modules, because those add requests in unbundled dev.
5. **Fix the stall (section 5) before recommending this broadly.** Also handle RequireJS's 90 s `waitSeconds`: the shim could `define` immediately and resolve later, or show a clear error.
6. If page-load time matters more than HMR for a team, the bundled mode is the known remedy. It was not evaluated here because the user ruled it out.

## 5. Reliability: intermittent stall of an optimized-dep chunk (verified live, not root-caused)
- **9 of 67 Vite page loads** stalled: 3 of 9 at 250 modules, 6 of 58 at 1000. It happened on cold loads, F5 and empty-cache reloads alike. In every case `/node_modules/.vite/deps/react-dom-<hash>.js?v=…` stayed **pending in Chrome**.
- After 90 s, SharePoint's RequireJS (`requirejs.s.contexts._.config.waitSeconds = 90`, read live) fails both web parts with `Load timeout for modules: spfx-vite-loader-…!/@spfx-entry/…`.
- During a stall, `curl` (both HTTP/1.1 and h2) got that same URL from the same server in **35 ms**. So the server isn't hung. The likely cause is client-side: the HTTP/2 stream, or both shims' `import()` calls racing on the shared chunk.
- `optimizeDeps.holdUntilCrawlEnd: false` did not fix it.
- **heft: 0 failures** in about 24 loads.
- Next steps for the plugin:
  - load one ESM bootstrap per page (one `import()` for all components) instead of one per shim;
  - test with HTTP/1.1 (Vite 8 served h2 even with a `server.proxy` entry);
  - add a client-side retry/timeout around the `import()`.

## 6. Findings for the PoC plugin (`tools/vite-plugin-spfx-serve`, unmodified)

| # | Finding | Effect | Bench workaround |
|---|---|---|---|
| F1 | `@pnp/spfx-controls-react` 3.25.0 has `import styles from './X.module.scss'`, but only the precompiled `X.module.scss.css` exists (webpack finds it through `resolve.extensions` + sp-css-loader) | dependency pre-bundling fails with `PARSE_ERROR` on `PeoplePickerComponent.module.scss.css` | `optimizeDeps.rolldownOptions.plugins`: resolve to the `.css` file and load it as JS (`loadStyles(css)` from `@microsoft/load-themed-styles` + identity class map) |
| F2 | **sp-\* imported inside deps**: pre-bundling doesn't run Vite plugins, so pnp's nested `@microsoft/sp-*` **1.23** copies would be bundled into the chunk, and the bare `import 'ControlStrings'` can't be resolved | duplicate sp-core-library/sp-http; optimizer error | the same optimizer plugin marks `@microsoft/sp-*` and loc names external. Vite's import analysis then routes them through spfx-serve. Verified: the served pnp chunk imports `/@id/__x00__spfx-external:@microsoft/sp-http` and `…spfx-loc:ControlStrings` |
| F3 | Externals = `package.json` dependencies **∩ imported from `src/`**. sp-\* used only by deps are neither preloaded by the shim nor faced | live error: `"@microsoft/sp-lodash-subset" was not preloaded by SharePoint`; BenchPnp failed to load | added `@microsoft/sp-http` to dependencies, and imported `sp-http`/`sp-lodash-subset` from `src` (legitimate uses). The plugin should discover externals the way Heft does, including deps' imports |
| F4 | pnp controls depend on `react@17.0.1` (nested copy) | duplicate React in the pre-bundled chunk (inferred; not run without the fix) | `resolve.dedupe: ['react', 'react-dom']` |
| F5 | Loc resources in node_modules (`ControlStrings: node_modules/@pnp/…/lib/loc/{locale}.js`) | **worked**: `libToSource` leaves non-`lib/` paths alone, and the file exists. The plan's "❌" is too pessimistic for this case | none |
| F6 | `@types/react` 17 nested under pnp breaks `tsc` for `heft build` (TS2786 "cannot be used as a JSX component") | heft build fails | npm `overrides` for `@types/react`/`@types/react-dom` in the bench package.json (a general SPFx + pnp issue, not Vite) |
| F7 | Sass `@import` prints a deprecation block per file in the Vite log (very noisy with 122 files) | log noise | generator switched to `@use … as *` |
| F8 | Stall + RequireJS 90 s timeout | ~13 % failed loads | none (see section 5) |

SPFx/heft findings, not about the plugin:
- **SPFx 1.24.1 `heft start` serves `manifests.js` with `internalModuleBaseUrls: ["https://localhost:4321/dist/"]` even when `serve.json` has `"port": 4341`.** The server listens on 4341, so no bundle loads. `debugBaseUrl` in `WebpackConfigurationGenerator` reads the port, but the served cumulative manifest comes from `CumulativeManifestProcessor`, where `baseUrl` defaults to `https://localhost:4321`. The webpack-dev-server client does use 4341.
  - The bench harness worked around it by rewriting that one response through CDP `Fetch`.
- `heft start` without `--clean` is no faster (22.6 s at 1000 modules). Lint is skipped in watch mode.
- With two web-part bundles on the page, webpack HMR/live reload reloaded the page on the first edit only. Later edits logged "[HMR] App is up to date" and didn't update the DOM.

## 7. What was verified live vs inferred
- **Live on the tenant** (headless Chrome, page `spfx-bench.aspx` as a draft):
  - all page loads, the SharePoint baseline, and the edit latencies;
  - both web parts rendering with both servers, including PnPjs results and theme tokens;
  - the stall, and RequireJS `waitSeconds = 90`;
  - the heft port bug.
- **Local only:** server start, the crawl, and RSS/CPU (`/proc` process-tree sampling every 250 ms).
- **Inferred:**
  - F4 (dedupe) was not run without the fix;
  - the 2000-module page-load extrapolation;
  - the heft "realistic 4–5 s" edit figure (measured value minus the harness's 1.5 s wait).

## 8. Reproduce
```bash
cd /home/sergei/Projects/spfx-bench
node tools/generate.mjs --modules 1000            # or 250 / 2000, --barrels off
node tools/bench/start.mjs 3 heft,vite            # server start (no browser)
node tools/bench/crawl.mjs 3                      # module graph crawl (no browser)
# Chrome with the contoso-sharepoint profile on CDP 9351, then:
node tools/bench/run.mjs sp-baseline|vite|heft|vite-warmup|vite-loads|vite-nohold 3
node tools/bench/summarize.mjs
```
`tools/bench/create-page.mjs` created the page through REST: `sitepages/pages` → `savepageasdraft` with `CanvasContent1` for both web parts.
