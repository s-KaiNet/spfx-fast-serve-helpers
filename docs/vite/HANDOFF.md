# Handoff: Vite dev server for SPFx (SPFx 1.22+ / Heft)

Status on 2026-11-17: **P0 items 1–17 and P1 are done** (§6). #17 (project tsconfig applied to the Oxc transform) is the latest, see `research/tsconfig-decorators/`. The package is `spfx-fast-serve-helpers` 1.24.0 (SPFx 1.24.x), a zero-config `fast-serve` CLI; user docs in `README.md` and `docs/*.md`, code layout in `src/README.md`.

Read this file first. Every claim below links to a detailed report in `research/`.

---

## 1. Goal and user decisions

**Goal:** a reusable npm package that replaces `heft start` **for development only**:
- fast server start;
- true HMR with React Fast Refresh;
- the SPFx web part runs inside a real SharePoint page.

Production builds and `.sppkg` packaging stay on Heft (`heft build` / `heft package-solution`). It's the successor to spfx-fast-serve (webpack/gulp, SPFx ≤ 1.21) for Heft-based SPFx. This repo, branch `vite`, is where the work continues.

Decisions the user made:

| Topic | Decision |
|---|---|
| Scope | dev server only, never production builds |
| v1 component types | **web parts only**; extensions, ACEs and library components later |
| React | a separate **development copy of React in dev is OK** (needed for Fast Refresh; the tenant ships production React) |
| v1 options | `port`, `pageUrl` (with `{tenantDomain}`), `locale`. HTTPS is automatic (SPFx dev cert), not an option |
| Not in v1 | CORS/allowedOrigins, `debug` flag, eslint, error overlay, `hotRefresh` flag (HMR is always on), logging levels, type checking |
| Later | ngrok/tunnel support; Docker/WSL (`containers`) |
| Vite bundled dev mode | **don't use** `experimental.bundledDev` |
| `sp-*` loading design | **on-demand facades with top-level await** (§4.3), chosen over preloading |
| Re-mount web part instead of page reload | future improvement, **not v1** (research/vite-serve-plan §4.1) |
| Architecture | don't copy spfx-fast-serve-helpers' structure. Take only the idea: semantic modules, clear data flow, easy to extend and read (§8) |
| Process | the user wants discovery and approval before building; ask when scope is unclear |

## 2. Where things are

| Path | What |
|---|---|
| `poc/plugin/` | working PoC Vite plugin (copied from `/home/sergei/Projects/spfx-rea/tools/vite-plugin-spfx-serve`; the original still powers `npm run serve` there) |
| `poc/vite.config.mjs` | how the PoC is wired in a project |
| `poc/HelloWorld.functional.example.tsx` | the HelloWorld component converted to a function component (Fast Refresh works best with function components) |
| `research/spfx-pipeline/` | reverse-engineered SPFx 1.24 build → serve → runtime-loader contract. **Start with `index.md` and `07-vite-integration-notes.md`** |
| `research/vite-serve-plan/README.md` | the original plan: parity list (P0/P1/P2 tables), architecture proposal, easy-to-miss items, future improvements. §6 below updates it |
| `research/tla-externals/` | research: on-demand `sp-*` via top-level await (live-verified), with prototype and Rolldown tests |
| `research/benchmark/` | Vite vs `heft start` on 250/1000 generated modules: report, raw results, generator and harness |
| `research/tsconfig-decorators/` | research: project tsconfig not applied by Vite 8/Oxc; legacy decorators, class fields, `emitDecoratorMetadata`, `const enum`; fix config and experiment files |
| `research/pnp-scss/` | research: SPFx libraries importing `.module.scss` that only ship `.module.scss.css`, with a working fix prototype |
| `research/vite-serve-plan/generate-spfx-webpack-config.cjs` | calls Heft's `WebpackConfigurationGenerator` from plain Node (no build) to get entries/externals |

Test projects on this machine (not in the repo):
- `/home/sergei/Projects/spfx-rea`: SPFx 1.24.1, one HelloWorld web part (now a function component), PoC wired as `npm run serve`. Vite 8.3.8, `@vitejs/plugin-react` 6.3.0 and `es-module-lexer` 1.7.0 are dev deps (installed once with `--legacy-peer-deps`).
- `/home/sergei/Projects/spfx-bench`: generated big project (default 1000 modules; `node tools/generate.mjs --modules N`) with Fluent UI, `@pnp/spfx-controls-react`, `@pnp/sp`. Port 4341. Its `tools/vite-bench-workarounds.mjs` contains temporary workarounds; see `research/benchmark`.

Tenant pages (`https://mastaq.sharepoint.com/sites/dev/`):
- `SitePages/spfx-rea.aspx`: HelloWorld web part, saved as draft;
- `SitePages/spfx-bench.aspx`: the bench web parts, saved as draft.

## 3. How SPFx serve works (short) → see research/spfx-pipeline

- **Page bootstrap:** the SharePoint page loads `sp-loader`, which builds RequireJS. With `?debugManifestsFile=<url>&debug=true&noredir=true`:
  - the user sees an "Allow debug scripts?" prompt;
  - the loader fetches `manifests.js`, an AMD module with `getManifests()`, and registers those manifests;
  - CSP allows `localhost:*` scripts only when the debug params are present.
- **Loading a component:** RequireJS `paths` + `map` per component; module id `<componentId>_<version>`; the `default` export is the web part class.
- **Framework packages:** framework packages + React come from the **page**, always the tenant's version (same major, ≥ requested). The project builds on 1.24.1, but the tenant serves 1.25.0. Production works the same way, so a newer tenant is fine. A project *newer* than the tenant fails in prod too. The dev server should only show a clear message.

## 4. How the PoC works (dev flow)

1. `GET /temp/build/manifests.js` → generated debug manifests:
   - built from `config/config.json` bundles, the source `*.manifest.json` and the `package.json` version;
   - `scriptResources` point to the shim (see step 2).
2. `GET /@spfx/component/<id>.js` → a classic **AMD shim**. It defines `<id>_<ver>` through a RequireJS loader plugin, which:
   - (PoC) preloads `sp-*` externals with the component-scoped `require` and stores them on `window.__spfxViteExternals`;
   - then `import()`s the entry from Vite.
3. In Vite:
   - `@microsoft/sp-*` imports → virtual facade modules re-exporting SharePoint's instances;
   - `*Strings` (localizedResources) → virtual modules built from `loc/<locale>.js`;
   - the generated entry imports `@vitejs/plugin-react/preamble` first (SharePoint hosts the page, not index.html);
   - `import.meta.hot.accept(() => location.reload())` is the fallback when an update reaches the web part class.
4. **Theme tokens:** the CSS modules' `updateStyle` import is swapped for `themed-styles-runtime.js`, which:
   - resolves `"[theme:x, default:y]"` from `window.__themeState__.theme`;
   - lets Vite still own the `<style>` tags, so CSS HMR works;
   - (PoC only) re-resolved on theme change by polling. **Removed in P1 by user decision:** tokens resolve once per style insert/hot update; no theme monitoring.
5. React/ReactDOM come from node_modules (development build). Fast Refresh keeps state.

Live-verified in the PoC:
- Vite ready in ~0.3 s (heft cold ~5.7 s on HelloWorld);
- TSX edit → in-page update < 250 ms, state kept;
- SCSS edit → hot swap, state kept;
- theme tokens resolved to tenant colours;
- web part class edit → full reload (intended);
- `npm run build` (heft) unaffected.

### 4.3 Decided design change: on-demand `sp-*` facades (research/tla-externals)

Each facade does `await loadComponentById(id, version)` (id/version from `node_modules/<pkg>/dist/*.manifest.json`) and re-exports. Live-verified:
- tenant version 1.25.0 is returned, and it's the **same instances** as the page (`window.require('<id>_1.25.0')`);
- works inside pre-bundled third-party deps;
- `import('@microsoft/sp-property-pane')` works;
- new `sp-*` imports added mid-session hot-update without a reload;
- the web part was ready ~300 ms sooner;
- the awaits cost ~1 ms per already-loaded package.

Consequences:
- the debug manifest lists **no** `sp-*` (at most `sp-loader`);
- the shim no longer preloads anything;
- the `src` import scan is removed.

Conditions:
- **CommonJS** importers (`require('@microsoft/sp-…')`) can't take TLA (`[REQUIRE_TLA]`). They get a synchronous facade, and each pre-bundled chunk starts with one `await preload([...])` (also turns 154 ms of sequential awaits into 52 ms);
- fix the "ERROR: [object Object]" message shown in the web part on load failure;
- a failed facade stays failed until reload (browsers cache module errors);
- untested: non-Microsoft SPFx library components from the app catalog.

Why not the alternatives (user asked):
- **A** (PoC preload + scan of src *and* deps) is more code and needs a reload for new imports;
- **B** (list every SPFx library in the manifest) is the simplest code, but SharePoint loads all 14 libraries on every page load.

## 5. Benchmark results (research/benchmark)

1000 generated modules, live on the tenant, medians of 3. The page loaded **all** ~1000 TS files + 122 SCSS, a worst case; real pages load only one web part's graph.

| | heft start | Vite |
|---|---|---|
| server start | 22.6 s | 0.3 s warm / 1.24 s cold |
| edit → DOM updated | ~4–5 s (rebuild + reload) | 34–61 ms |
| cold page load | 3.3 s | 8.5 s |
| F5 reload | 2.6 s | 5.8 s |
| localhost requests | 6 | 1180 |
| server memory | 1.2–1.3 GB | ~0.45 GB |

- **250 modules:** heft F5 2.4 s, Vite 3.6 s; Vite edits 23–34 ms. SharePoint alone is ~1.1–1.4 s of every load.
- **The bottleneck** is the browser fetching/evaluating ~1200 modules, not transforms: a warm crawl takes 0.4 s, but a load is still 6.3 s.
- **Mitigations:**
  - `server.warmup` −1.3 s cold: enable it;
  - browser cache −0.5 s;
  - removing barrels: no effect there.
- **Heft bugs seen** (not ours):
  - `heft start` 1.24.1 writes port 4321 into `manifests.js` even when `serve.json` sets another port;
  - heft's auto-reload only worked on the first edit with two web parts on a page.

## 6. Current priority list (supersedes the status columns in research/vite-serve-plan)

Legend: ✅ in PoC · 🟡 partial · ❌ missing · 🔬 researched, fix known. The P0 status column is the pre-implementation state: items 1–17 are now implemented (`git log`, `src/README.md`).

### P0 (v1, web parts)
| # | Item | Status / solution |
|---|---|---|
| 1 | Web part: manifest, shim, ESM entry, HMR, Fast Refresh | ✅ |
| 2 | **Several components per bundle** (`config.json` bundle with >1 component): one shim per **bundle**; the entry re-exports each component as `export * as <exportName>`; each manifest gets `loaderConfig.exportName` | ❌ |
| 3 | **On-demand `sp-*` facades with TLA** + sync facade for CJS + per-chunk preload; also used inside `optimizeDeps.rolldownOptions.plugins` (fixes duplicate `sp-*` copies in pre-bundled deps; a confirmed 56 KB duplicate of sp-core-library in a test) | 🔬 research/tla-externals |
| 4 | **Libraries importing `.module.scss` that ship `.module.scss.css`** (`@pnp/spfx-controls-react`): resolve to `.css` when the source is missing, compile with SPFx's own `@microsoft/sp-css-loader` (same class hashes, `:global`, `:export`, `loadStyles` theme tokens); in both normal and pre-bundle paths | 🔬 research/pnp-scss (`spfx-lib-css.mjs`) |
| 5 | Keep `ControlStrings` / other `localizedResources` imports out of pre-bundling; loc files in node_modules | 🟡 loading works (the plan wrongly said it didn't); the pre-bundle external is needed |
| 6 | `resolve.dedupe: ['react','react-dom']` (pnp ships React 17) | ❌ trivial |
| 7 | CommonJS `require('./x.png' / './t.json')` in TS source → hoisted import | ❌ |
| 8 | Type-only re-exports without `type` (`export { IFoo } from`) crash in the browser: detect + clear error | ❌ |
| 9 | `.module.scss` typings regeneration (`temp/sass-ts`), else the IDE shows errors for new classes | ❌ |
| 10 | Clear error messages: load failures (`[object Object]`), project SPFx newer than tenant | ❌ |
| 11 | `define`: `DEBUG`, `process.env.NODE_ENV` | 🟡 |
| 12 | Use `@rushstack/debug-certificate-manager` instead of reading `~/.rushstack` files | 🟡 |
| 13 | `server.warmup` for src | ❌ trivial (−1.3 s cold) |
| 14 | Options: `port`, `pageUrl` (`{tenantDomain}`/`SPFX_SERVE_TENANT_DOMAIN`), `locale` | 🟡 |
| 15 | SPFx version check / version-locked package (`~1.24.0`, like spfx-fast-serve) | ❌ |
| 16 | Install friction: `@vitejs/plugin-react` 6 optional Babel-8 peers clash with Jest's Babel 7 under npm (`--legacy-peer-deps`). Resolve React/plugins from the project (pnpm) | ❌ |
| 17 | **Project tsconfig not applied** (found 2026-11-17): legacy decorators reach the browser untransformed, class fields without initializers reset base-class values. Pass a whitelist of compiler options via `oxc.tsconfig` | 🔬 research/tsconfig-decorators. **Done:** `transforms/tsconfig` passes `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict`, `strictNullChecks` (read through `extends` by the shared `project/tsconfig.ts` loader) as an inline `oxc.tsconfig`, so Oxc's automatic lookup is off; a change of these options restarts the server. Verified live in spfx-rea: decorator/field results identical to `heft build` output |

### P1 (status 2026-11-17)
| Item | Status |
|---|---|
| tsconfig `paths` aliases (own resolver: Vite's `resolve.tsconfigPaths` ignores a rig-extended `include`) | ✅ |
| static-asset typings (`temp/static-asset-ts`, like heft) | ✅ |
| remove theme-change monitoring (polling) | ✅ |
| `config.json` `externals` (URLs and local files) | ✅ |
| TS loc files | ✅ |
| docs: migration, HMR do's and don'ts, VS Code `launch.json` (`docs/*.md`) | ✅ |
| cleanups from the P0 review: shared runtime `describeError`, one default locale, server/defines tests, no source maps in the package, `require()` of `paths` aliases | ✅ |
| warmup timing: Vite warmup off; the entry graph is warmed after the first pre-bundling (`server/warmup.ts`), SCSS typings start after it; cold start → optimizer done 4.5 s → 1.9 s | ✅ |
| PnP web part slower than the PoC: cause was warmup flooding + unfiltered pre-bundle plugin hooks; cold PnP load 6.97 s → 4.48 s (PoC ~3.8 s) | ✅ |
| second web part rendered on a page: added to the `spfx-rea.aspx` draft (not published), renders and hot-updates | ✅ |
| docs: legacy decorators supported, `emitDecoratorMetadata` limits, `const enum` from `.d.ts` / dependencies not supported (use a regular `enum`) (research/tsconfig-decorators) | ✅ (README) |

Cut from P1 by the user: `config/sass.json` in the Vite Sass compile, locale switch, theme setter hook, `@pnp/spfx-property-controls` 3.13 already-hashed CSS, the occasional page-load hang (moved to later; seen in 27 of 116 loads during the P1 perf runs, 0 of ~30 in the P1 acceptance). Deferred to later by the user: `const enum` / decorator checks with clear errors (ReferenceError for an ambient enum, unresolved `.d.ts` import, missing export from a dependency, type imports kept by `emitDecoratorMetadata`); only the docs are in P1.

Heft findings (P1):
- `config.json` `externals` go into the manifest as `{ type: "path", path, globalName?, globalDependencies? }`: URLs as is, local files copied to `dist/`.
- Loc files: TypeScript `define([], …)` works; `export default` builds but breaks under RequireJS; `export =` fails with TS1203.
- `fast-serve` lists every external in every manifest (one shared RequireJS `require`).

### Next (agreed 2026-11-17)
- VS Code debugging: verify the `docs/debugging.md` `launch.json` with F5 in real VS Code;
- terminal noise: don't forward SharePoint's own errors (edit-mode `summarizer-worker`) and PnP telemetry "Failed to fetch";
- occasional page-load hang (`react-dom` request stuck pending; 27 of 116 loads in the P1 perf runs);
- `const enum` / decorator checks with clear errors (ambient enum ReferenceError, unresolved `.d.ts` import, missing export from a dependency, type imports kept by `emitDecoratorMetadata`);
- extensions (Application Customizer, ListView Command Set, Field/Form Customizer) with `serve.json` `serveConfigurations` → query params;
- ACEs.

Ignored by the user: warmup waiting 30 s when nothing is pre-bundled; the one-time error after adding a `config.json` external mid-session. Nothing is pushed or published until the user says so.

### Later (not planned now)
- library components (own server, or alias to src);
- ngrok/tunnel;
- Docker/WSL;
- Teams hosts;
- re-mount instead of reload (research/vite-serve-plan §4.1).

## 7. Easy-to-miss gotchas (collected)

- **HMR boundaries:**
  - files that export components *and* other values skip Fast Refresh → update bubbles up → reload;
  - services imported by the web part class also reload the page;
  - module-level side effects (`initializeIcons`, PnPjs singletons) re-run.

  Advise `onInit` for setup and function components in component-only files.
- In dev, all bundles share one ESM graph (one module instance). In prod each bundle has its own copy (documented in docs/migration.md and docs/hmr.md).
- The debug URL is sticky in `sessionStorage["spfx-debug"]`: opening the page without the query in the same tab retries localhost (CSP error).
- The dev cert must be trusted (`npx heft trust-dev-cert`); Chrome/Edge Local Network Access prompt.
- Vite needs `server.origin` (absolute asset URLs) and `optimizeDeps.entries` (no index.html).
- Watch-ignore `lib/`, `dist/`, `temp/`, `release/`, `teams/`.
- `@microsoft/sp-lodash-subset` ships an AMD blob in its "ESM" folder (export names have to be read differently).
- Heft's `WebpackConfigurationGenerator.generateWebpackConfigurationAsync({serveMode:true, production:false})` runs in ~0.7 s without a build and returns entries + the full externals list. Useful as the "SPFx is the source of truth" adapter (internal-ish API → version-lock).

## 8. Architecture proposal (to confirm with the user)

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**.

Semantic modules:

| Module | Owns |
|---|---|
| `config` | options (`port`, `pageUrl`, `locale`), validation, defaults |
| `project` | SPFx facts, plain Node, **no Vite imports**: `config.json`, manifests, `package.json`, `serve.json`, `sass.json`, SPFx library ids/versions, `lib→src` mapping, locales. Cached, with `invalidate(file)` |
| `manifests` | debug `manifests.js` |
| `loader` | AMD shim per bundle + generated ESM entries |
| `externals` | `sp-*` facades (TLA + CJS variant), in normal and pre-bundle pipelines |
| `localization` | strings modules |
| `styles` | theme tokens runtime, lib `.module.scss.css` via sp-css-loader, SCSS typings |
| `transforms` | `require()` → import, type-re-export guard, defines |
| `server` | https cert, port, printed/open URL, watch config, warmup |
| `runtime` | browser code as real TS files (shim template, facade helpers, themed styles) |

A "feature" is one such module returning Vite plugin(s) plus its browser runtime and tests. Example: `styles/themeTokens` = resolveId/load for the runtime + the transform swapping `updateStyle` + `runtime.ts` + a test. `index.ts` composes them: `spfxServe(options): Plugin[]`.

Package entry points:
- a Vite plugin for users with their own `vite.config.ts` (extensibility = Vite config);
- a zero-config CLI (`npx <pkg>` / `init`) that runs Vite programmatically.

The package name is still undecided: ask the user (a new major of spfx-fast-serve(-helpers), or a new name).

## 9. Live debugging with agent-browser (how all research was verified)

Prereqs:
- the Vite (or heft) server runs on `https://localhost:<port>`;
- the dev cert is in `~/.rushstack/` (`rushstack-serve.pem/.key`).

**Browser profile.** The saved, logged-in profile is `/home/sergei/.agent-browser-profiles/mastaq-sharepoint` (see the `agent-browser-profile` skill).
- Always run agent-browser as `env -u XDG_RUNTIME_DIR agent-browser ...` (a socket-path quirk on this host).
- **Only one Chrome per profile:** check `pgrep -af mastaq-sharepoint` first. Never delete lock files, never use a fresh profile (that loses the login).
- If Microsoft asks to log in, let the user sign in through `env -u XDG_RUNTIME_DIR agent-browser dashboard start` (http://localhost:4848). Never ask for credentials.

**Start Chrome yourself.** This works reliably; agent-browser's `--args` did not apply the cert/LNA flags.
```bash
/home/sergei/.agent-browser/browsers/chrome-153.0.8010.36/chrome --headless=new --no-sandbox \
  --user-data-dir=/home/sergei/.agent-browser-profiles/mastaq-sharepoint \
  --ignore-certificate-errors --disable-features=LocalNetworkAccessChecks,Translate \
  --remote-debugging-port=9333 --window-size=1280,900 about:blank &
AB="env -u XDG_RUNTIME_DIR agent-browser --session vite-dev --cdp 9333"
$AB open 'https://mastaq.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true'
```
- Without those flags you get "Error loading debug manifests" (`ERR_CERT_AUTHORITY_INVALID` or LNA block).
- First visit: the "Allow debug scripts?" dialog. Click "Load debug scripts" (`$AB snapshot -i`, then `$AB click @eN`).

**Useful checks:**
```bash
$AB console | grep -iE "error|vite"                       # "[vite] connected." = HMR client up
$AB eval '(()=>{const s=document.querySelector("[class*=helloWorld_]");return s?s.innerText.slice(0,80):"not found"})()'
$AB eval 'Object.keys(window.require.s.contexts._.defined).filter(k=>/_\d+\.\d+\.\d+$/.test(k))'   # loaded SPFx modules/versions
$AB eval 'window.__themeState__.theme.themePrimary'        # theme the tokens resolve against
$AB eval '(()=>{const r=performance.getEntriesByType("resource").filter(e=>e.name.startsWith("https://localhost"));return r.length})()'
$AB screenshot /tmp/shot.png
```

**Testing HMR:** set a marker (`window.__mark="alive"`), click a state counter, edit a file, then poll the DOM. If the marker survives and the counter value is unchanged, it was a hot update, not a reload. Always restore the edited files afterwards.

**Programmatic CDP:** the benchmark harness (`research/benchmark/bench-project-tools/tools/bench/browser.mjs`, `lib.mjs`) shows raw CDP usage for timings, network and console capture.

**Cleanup:** `$AB close`, kill your Chrome (`pgrep -f remote-debugging-port=9333`) and your Vite server. Never kill processes you didn't start.

**Pitfalls:**
- Opening the page without the debug query in a tab that had it → "Error loading debug manifests" (sessionStorage stickiness). Use a new tab, or clear `sessionStorage["spfx-debug"]`.
- Vite must listen on `localhost`, not `127.0.0.1`: CSP allows `localhost:*`.
- HAR files contain auth cookies: keep them outside repos.

## 10. Suggested next steps (after user approval)
1. Confirm the v1 scope (§6 P0) and the package name/shape (§8) with the user.
2. Scaffold the TypeScript package in this repo (branch `vite`). Port the PoC into the module layout, using `spfx-rea` and `spfx-bench` as fixtures.
3. Implement P0 in this order:
   1. on-demand facades;
   2. bundles with several components;
   3. lib CSS;
   4. dedupe/warmup/defines;
   5. `require()` transform;
   6. typings;
   7. errors.
4. Re-run the benchmark harness after the facade change.
