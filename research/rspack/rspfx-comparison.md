# rspfx vs fast-serve (Rspack line): gap analysis

Date: 2026-11-20. Compared: [master8848/rspfx](https://github.com/master8848/rspfx) at `cea1aeb` (HEAD, 2026-09-12) and npm `@mbsks/rspfx-*@0.0.15` (2026-08-28) with this branch (`1.24.0-rspack.11`/`.12`). Research only: no live SharePoint check was made; everything marked "tested" ran locally against copies of spfx-rea / spfx-bench in `/var/tmp/rspfx-research/` (ports 4460–4469).

## Verdict

**rspfx has many gaps for the job fast-serve does.** It is a different product: a replacement toolchain (build + package + deploy, Vite by default, Rsbuild/Rspack as alternatives, many frameworks) whose dev loop for an *existing heft project* ("hybrid mode", `rspfx dev` with no config file) is a side feature. On our two test projects it **does not start out of the box**: yo-generated manifests with comments fail (`JSON.parse`), and multi-component bundles fail (`COMPILE_ENTRY_NO_COMPONENT_ID`). With those patched in the copy, it still bundles stale heft output from `lib/` when `lib/` exists, has no image rule, no theme tokens, no heft class names, no `config.json` URL/file externals, no extension debugging (`serveConfigurations`), and the multi-bundle HMR problems we fixed in R5 are present. Most of the edge cases this branch handles were never addressed there.

Count over 77 rows (from our implementation's checklist): **covered 19 · partial 22 · missing 30 · not applicable 3 · unverified 3**. Several "covered" rows are basic plumbing (CORS, AMD `define`, `no-store` manifests, development React); the missing ones are the edge cases found on real projects.

## rspfx facts

| | |
|---|---|
| Version | repo `0.0.15` (+68 unreleased commits after tag `v0.0.15`); npm `@mbsks/rspfx-cli@0.0.15` |
| SPFx | docs: 1.20–1.24, **1.24 "Preview"**, 1.23 default ([docs/compatibility.md](https://github.com/master8848/rspfx/blob/cea1aeb/docs/compatibility.md)); `rspfx doctor` on SPFx 1.24.1 reports "expected 1.23.x" (tested, 0.0.15) |
| Maturity | 324 commits from 2026-08-01 to 2026-09-12 (no activity for ~10 weeks), one author (315/324 commits; the rest are tags/merges), 0 stars, 0 forks, 0 issues, 5 merged self-PRs, no GitHub releases (tags only). 80 test files / ~709 `it`/`test` cases (not run here). Agent-written code (comments reference `.agents/notes`, very long valibot messages) |
| License | MIT |
| Architecture | Own config, written from scratch (no heft webpack config, no heft plugins). Replaces `heft start` (and, after `rspfx migrate`, heft build/package). Rspack path: [compiler-rspack/src/config.ts](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/config.ts) (`builtin:swc-loader`, style-loader + css-loader + sass-loader, AMD library per entry, `document.currentScript` publicPath plugin), `@rspack/dev-server` with `writeToDisk: true` into `dist/`, own `manifests.js` at `/temp/manifests.js` with a polling/websocket auto-reload client, optional `--refresh` (React Refresh plugin). Rspack **1.7.12**, dev-server 1.2.1. Own self-signed certificate in `~/.rspfx/certs`. Optional Rust crates (not in the npm packages) |
| Install health | npm `@mbsks/rspfx-cli@0.0.15` pins its internal packages at `0.0.14` → crashes at start (`'@mbsks/rspfx-manifest-server' does not provide an export named 'formatTrustInstructions'`, tested). Works only with `overrides` forcing every `@mbsks/rspfx-*` to `0.0.15`. HEAD built from source (bun): declaration builds fail on test type errors; the `rspfx` bin never runs `main()` (entry guard compares the wrong module); run via `dist/325.js` it **rejects standard source manifests** (`"version": "*"`, no `loaderConfig` → `CONFIG_VALIDATION_FAILED`, tested) — the unreleased line is a regression for hybrid mode |
| Live validation claimed | packaging gate for scaffolded projects (2026-08-22, [docs/real-tenant-validation.md](https://github.com/master8848/rspfx/blob/cea1aeb/docs/real-tenant-validation.md)); dev loop against SharePoint only documented, no HMR/extension acceptance on a tenant found |

## Local test setup (what was run)

- `rea`: copy of spfx-rea, `npm i -D @mbsks/rspfx-cli@0.0.15 @mbsks/rspfx-plugin@0.0.15` + overrides, `rspfx dev [--refresh] --port 446x --tenant contoso.sharepoint.com`, `HOME` redirected so the certificate went to the research folder, stdin not a TTY (no auto-trust). To get past the first blockers, the copy's manifests were stripped of comments and the 3-component bundle split into 3 bundles; later `lib/` was moved away to make rspfx compile `src/`.
- `bench`: copy of spfx-bench (manifests have no comments, single-component bundles): compiles with 0 errors; bundles inspected over HTTP.
- `ours`: this branch's `lib/cli.js` on the same `rea` copy (one run, port 4465) to double-check the Sass `~` case, plus `npx heft build` in the copy for heft's Sass result.

## Checklist

Status of **rspfx** for each case our implementation handles. "tested" = observed locally; "static" = from code reading only. Links point to `cea1aeb`; behaviour checked on npm `0.0.15` unless marked HEAD.

### Project model and config

| # | Case (ours) | rspfx | Evidence |
|---|---|---|---|
| 1 | SPFx 1.24.x version check at start | partial | dev runs any version; `doctor` wrongly demands 1.23.x for 1.24.1 (tested) |
| 2 | `config/config.json` bundles, entry `./lib/**.js` → `./src/**.ts(x)` | partial | maps lib→src **only if the `lib` file doesn't exist** ([project.ts#L758-L786](https://github.com/master8848/rspfx/blob/cea1aeb/packages/dev-runtime/src/project.ts#L758-L786)); with heft's `lib/` present it bundles stale compiled JS from `lib/` (tested: modules `./lib/webparts/helloWorld/...` in the served bundle, `src` edits ignored) |
| 3 | Multi-component bundles (generated entry, `exportName`) | missing | one entry per component with the same name, ids pushed to the last one ([project.ts#L948-L965](https://github.com/master8848/rspfx/blob/cea1aeb/packages/dev-runtime/src/project.ts#L948-L965)) → `COMPILE_ENTRY_NO_COMPONENT_ID` for spfx-rea's `hello-world-web-part` (tested); no `exportName` anywhere |
| 4 | Source manifests as JSON with comments | missing | plain `JSON.parse` ([component-manifests.ts#L172](https://github.com/master8848/rspfx/blob/cea1aeb/packages/manifest-generator/src/component-manifests.ts#L172), [project.ts#L958](https://github.com/master8848/rspfx/blob/cea1aeb/packages/dev-runtime/src/project.ts#L958)) → "Expected double-quoted property name … line 7" on spfx-rea (tested); HEAD additionally rejects `"version": "*"` and missing `loaderConfig` (tested) |
| 5 | `version: "*"` from `package.json` | covered | 0.0.15 (tested); broken on HEAD (row 4) |
| 6 | `config/serve.json` port | covered | static + tested (`--port` overrides) |
| 7 | `serveConfigurations`, page order, `pageUrl`, extension query | missing | no `customActions`/`loadSPFX`/`fieldCustomizers` code anywhere (static); always prints a workbench URL |
| 8 | `{tenantDomain}` / `SPFX_SERVE_TENANT_DOMAIN` | partial | env var supported; 0.0.15 prints `https://https//contoso…` when `--tenant` has a scheme (the documented form), HEAD requires the scheme (tested) |
| 9 | SPFx libraries from `node_modules` (any package with a library manifest) | partial | only `node_modules/@microsoft/*` scanned ([sp-dependencies.ts#L83](https://github.com/master8848/rspfx/blob/cea1aeb/packages/manifest-generator/src/sp-dependencies.ts#L83)); third-party library components are bundled unless listed in `config.json` externals (static) |
| 10 | `@microsoft/microsoft-graph-client` as heft's non-standard external | unverified | not checked |
| 11 | tsconfig chain (rig `extends`) read into the model | missing | Rspack path never reads tsconfig (`build.tsconfigPath` validated but unused in the Rspack config, static) |
| 12 | `config/sass.json` (merged, `extends`) | missing | not read anywhere (static) |
| 13 | Missing-source / bad-config errors with file names | partial | clear for missing entry files; manifest/JSON errors without the file name in 0.0.15 (tested) |

### Entries, bundles, AMD output, externals

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 14 | AMD `define` with the externals the bundle uses | covered | `define('<id>_<ver>', [used libs + loc])` (tested; named like heft's production output) |
| 15 | `scriptResources` = libraries the bundle really uses | partial | every component lists all 22 `@microsoft` packages + all 6 loc resources of the project (tested); harmless for loading as far as known (unused entries only feed the RequireJS map), unverified live |
| 16 | Library manifests in `manifests.js` | covered | includes every `@microsoft` library manifest like heft (the loader drops framework manifests) (tested) |
| 17 | Chunk/asset public path | covered | `document.currentScript` capture + sentinel replacement ([public-path.ts](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/public-path.ts)); ACE lazy chunk served (tested) |
| 18 | `uniqueName`/`chunkLoadingGlobal` not clashing with the installed production bundle | covered | hash of entries (static) |
| 19 | Images/fonts as `asset/resource` | missing | only `.html` → `asset/source` ([config.ts#L263](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/config.ts#L263)); spfx-rea: 3× "Module parse failed … PNG", the bundle throws when the module runs (tested) |
| 20 | JSON (ACE templates) | covered | Rspack default (ACE bundle compiled, tested) |
| 21 | Deep imports of SPFx libraries bundled, root stays external | unverified | exact-name externals like ours, so probably the same; not tested |
| 22 | Reload when a rebuild adds a new AMD external | unverified | `/__rspfx_hot.json` full reload without `--refresh` covers it; with `--refresh` unknown |
| 23 | Serve from memory, don't touch heft's `dist/` | not applicable | `writeToDisk: true` into `dist/` ([dev-server.ts#L160](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/dev-server.ts#L160)); heft does the same, hot-update files pile up there (tested) |

### `config.json` externals

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 24 | URL external `{ path, globalName }` | missing | `UNRESOLVED_EXTERNAL` unless the package has a library manifest ([manifest-helpers.ts#L78-L81](https://github.com/master8848/rspfx/blob/cea1aeb/packages/manifest-generator/src/manifest-helpers.ts#L78-L81)); tested: restart fails and the server process exits |
| 25 | Local-file external served under `/dist/`, reload on edit | missing | same |
| 26 | `globalDependencies` (transitive) | missing | same |
| 27 | named/namespace/default imports, `export *` from an external | not applicable | externals never get that far |

### Localization

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 28 | AMD loc files | covered | emitted as `<name>_<locale>.js` + `localizedPath` resources; all locales, the page language picks (tested, rea + bench) |
| 29 | Locale selection / per-resource `en-us` fallback | covered | `default` path = en-us (static); no `--locale` (page decides, closer to production than ours) |
| 30 | TS / ESM (`export default`) loc files | missing | files copied verbatim ([localized-resources.ts#L32](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/localized-resources.ts#L32)); a `.ts` loc file would be served as TypeScript (static) |
| 31 | Heft's warning for ES loc files | missing | static |
| 32 | Library strings (`ControlStrings` in `node_modules`) | covered | 30 PnP locales emitted, `ControlStrings` on the define (tested, bench) |
| 33 | Loc edit → rebuild/reload | missing | loc files are not compilation dependencies: edit gave no rebuild, served file stale (tested) |

### Sass and CSS

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 34 | Heft-identical CSS module class names | missing | css-loader default hash: `helloWorld: juxhMe1KrOAlKLd7` vs heft `helloWorld_be147114` (tested) |
| 35 | Theme tokens `"[theme:x, default:y]"` | missing | left raw in the CSS, no `load-themed-styles` (tested) → declarations invalid, theme colours lost |
| 36 | `pkg:` URLs | missing | no `NodePackageImporter` (`api: 'modern'` only, [helpers/css.ts#L60](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/helpers/css.ts#L60)); `pkg:@microsoft/sp-office-ui-fabric-core/...` failed (tested) |
| 37 | `~` imports | partial | sass-loader resolves them for packages that export the path (Fluent in bench compiled); `~@microsoft/sp-office-ui-fabric-core/dist/sass/SPFabricCore.scss` failed (package `exports` hide `dist/sass`) — **ours fails the same way, heft compiles it** (see "Found in ours") |
| 38 | `sass.json` `silenceDeprecations` / `quietDeps` / `loadPaths` | missing | not read; `@import` deprecation printed for every file (tested) |
| 39 | `.module.sass` / `.sass` | partial | rule matches `.s[ac]ss`; class names as in row 34 (static) |
| 40 | Global `.scss`, plain CSS, CSS from `node_modules` (+ `url()` assets) | partial | global CSS through css-loader works (static); `url()` images hit row 19 |
| 41 | Lib `.module.scss.css` | missing | when `lib/` is used (row 2), `./X.module.scss` resolves to `X.module.scss.css`, which the `\.module\.\w+$` test treats as global → `styles` is `undefined` (static, from the served bundle) |
| 42 | PostCSS config | not applicable | rspfx adds `postcss-loader` when a config exists (idea below) |

### Typings

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 43 | `temp/sass-ts` SCSS typings on start and change | missing | static |
| 44 | Static-asset typings | missing | static |

### TypeScript / tsconfig

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 45 | `paths`/`baseUrl` through rig `extends` | missing | `Can't resolve '@probe/probe'` (tested) |
| 46 | `experimentalDecorators` → legacy decorators | covered | `_ts_decorate` emitted (tested) |
| 47 | `emitDecoratorMetadata` | missing | not configured ([config.ts#L180](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/config.ts#L180)) (static) |
| 48 | `useDefineForClassFields` from tsconfig/target | missing | field without initializer emitted as `_define_property(this, "value", void 0)` under the rig's `target: es5` (tested) — shadows prototype accessors/decorated properties |
| 49 | Project `const enum` | covered | compiled like a regular enum (tested) |
| 50 | Global `declare const enum` / `.d.ts`-only import checks | missing | static |
| 51 | Type-only re-exports without warning noise | partial | harmless at runtime, but `ESModulesLinkingWarning: export 'OnlyType' … was not found` printed (tested) |
| 52 | JSX transform as SPFx (classic) | partial | forces `runtime: 'automatic'` ([framework-react/src/index.ts#L30](https://github.com/master8848/rspfx/blob/cea1aeb/packages/framework-react/src/index.ts#L30)); fine for React 17/18, differs from tsconfig (static) |

### Dev server

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 53 | HTTPS with the SPFx (heft) dev certificate | partial | own self-signed cert in `~/.rspfx/certs` → a second CA to trust; tries OS auto-trust (sudo prompts) in a TTY (static + tested generation) |
| 54 | CORS + `Access-Control-Allow-Private-Network` + `OPTIONS` 204 | covered | tested headers |
| 55 | SharePoint cross-site `no-cors` script requests and websocket | covered | `*.sharepoint.com` allowlist: script 200, ws 101 (tested); custom/vanity tenant hosts would be refused (static) |
| 56 | Port in use → clear message | partial | raw `EADDRINUSE` stack from the dev server (tested) |
| 57 | Actual port in manifests (heft's 4321 bug) | covered | component base URLs use the real port; library manifests still carry `localhost:4321` but the loader drops them (tested) |
| 58 | `manifests.js` `no-store` | covered | tested |
| 59 | Hot-update files `no-store` | missing | no cache headers (tested) |
| 60 | Only bundle/manifest/icon files served | partial | also serves `node_modules` (tested 200); heft serves the whole root, so not worse than heft |

### HMR and Fast Refresh

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 61 | Several bundles on one page: per-runtime hot-update global (fan-out) | missing | both bench bundles use the same `webpackHotUpdatee10f…` global, one compilation, no fan-out ([config.ts#L292](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/config.ts#L292)) (tested statically on served bundles; the same setup lost updates in our R5) |
| 62 | Fast Refresh injected per bundle | missing | stock `ReactRefreshRspackPlugin` entry, guarded by the shared `uniqueName` → only the first bundle gets the runtime (static, as R5) |
| 63 | Nested React copies collapsed (PnP's React 17) | missing | bench PnP bundle contains `./node_modules/react` **and** `./node_modules/@pnp/spfx-controls-react/node_modules/react` + both `react-dom` (tested) → "Invalid hook call" risk |
| 64 | Development React bundled | covered | `NODE_ENV=development`, React bundled (tested) |
| 65 | Style HMR without piling up / with theming | partial | style-loader HMR (static); no theme tokens (row 35) |
| 66 | Update reaching the entry → full reload | covered | dev-server live reload + `/__rspfx_hot.json` reload client (static) |
| 67 | Fast Refresh on by default | partial | opt-in `--refresh`; default is full reload on every save |

### Extensions, ACEs

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 68 | Application Customizer / Command Set / Field / Form Customizer on a real page (`--config`, warnings) | missing | manifests only; no query generation (row 7). Extensions work only in rspfx's local preview mock |
| 69 | ACEs: lazy property pane chunk, hosted workbench | partial | ACE bundle compiles, `sp-property-pane` on the entry `define`, `chunk.Hello-property-pane.js` 200 (tested); the hosted workbench it targets retires 2026-12-01; live unverified |

### Errors, terminal, restarts, customization, cache, deps

| # | Case | rspfx | Evidence |
|---|---|---|---|
| 70 | One error overlay per page, closes after the fix | missing | client overlay off ([dev-server.ts#L172](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/dev-server.ts#L172)), nothing else in SharePoint mode (static) |
| 71 | Concise terminal output (project paths, unwrapped messages, rebuild summary) | partial | raw Rspack stats, every error repeated on each rebuild, no summary line (tested) |
| 72 | Browser errors forwarded to the terminal with source maps; readable load errors | missing | static (no reporting runtime) |
| 73 | Restarts on project changes; failed restart keeps the old server | partial | watches only `config/config.json` + `node_modules/@microsoft` mtimes ([deps-watch.ts#L37](https://github.com/master8848/rspfx/blob/cea1aeb/packages/dev-runtime/src/deps-watch.ts#L37)); a failing restart **closes the server and the process exits**, no recovery after the fix (tested) |
| 74 | Extend file + guard rails, webpack-customization hint, agent skill | partial | full plugin path = user-owned `rspack.config.ts` with `RSpfxPlugin` (more freedom, no guard rails); hybrid mode takes no options; `spfx-customize-webpack.js` silently ignored by `dev` (only `migrate` deletes it); agent skill exists |
| 75 | Persistent cache with safe invalidation | partial | `.rspack-cache` in the project root (not in SPFx's `.gitignore`), `version` = framework/version/build options only, `buildDependencies` = bundler config files ([config.ts#L324-L338](https://github.com/master8848/rspfx/blob/cea1aeb/packages/compiler-rspack/src/config.ts#L324-L338)); stale hits after config/tsconfig/lockfile changes possible, not tested |
| 76 | `require()` / UMD / AMD in dependencies | covered | Rspack 1.7 parses AMD by default (static, not tested) |
| 77 | npm install without conflicts | partial | Rspack 1.x so no `css-loader` peer `ERESOLVE` (tested), but the published CLI crashes without `overrides` (tested) |

## Most important gaps for real projects

1. **Doesn't start on standard yo projects**: comments in manifests (row 4) and any multi-component bundle (row 3). HEAD is worse (rejects `"version": "*"`).
2. **Stale code from `lib/`** whenever heft built once (row 2): edits to `src` don't show up — silent and very confusing.
3. **Styling differs from production**: no theme tokens (35), non-heft class names (34), no `pkg:`/`sass.json` (36, 38), images break the build (19).
4. **No `config.json` URL/file externals** (24–26) — common on real projects (jQuery, CDN libraries); the restart then kills the server (73).
5. **Extensions can't be debugged on a page** (7, 68); everything targets the hosted workbench, retiring 2026-12-01.
6. **HMR on pages with several bundles or PnP controls** (61–63): exactly the two problems found the hard way in our prototype.
7. **tsconfig ignored** (45, 47, 48): `paths` aliases fail, class-field semantics differ from tsc.
8. **No error UX in SharePoint mode** (70–72).
9. **Packaging/maintenance risk**: published packages broken, single author, inactive since 2026-09-12.

## Ideas worth taking from rspfx

- **All locales in dev** (row 28): emit every locale as `localizedPath` and let the page language pick, as production does; we serve one `--locale`.
- **`doctor`-style checks**: certificate exists/expires/trusted in the OS store, port free, Node version — a `fast-serve --doctor` or a startup trust check would shorten "Error loading debug manifests" support.
- **`document.currentScript` public path**: chunks/assets resolve relative to where the bundle was loaded from, so a different forwarded port or host still works for remote setups (ours bakes `https://localhost:<port>/dist/`).
- **PostCSS when the project has a config** (Tailwind in SPFx).
- **Polling fallback for reloads** (`/__rspfx_hot.json`) when the websocket is blocked by a proxy.
- **Origin allowlist** (`*.sharepoint.com` + tenant) instead of `allowedHosts: 'all'` — curl showed it is enough for script and websocket requests from SharePoint origins; vanity domains would need the tenant host added.
- Lower priority: local preview without a tenant (mock `/_api`, emulated context), `--browser` to open the URL.

## Found in ours while testing

- `@import '~@microsoft/sp-office-ui-fabric-core/dist/sass/SPFabricCore.scss'` (the classic SPFx template line) **fails in fast-serve** ("Can't find stylesheet to import", one run of this branch's `lib/cli.js` on the rea copy), while `pkg:` for the same file works and **heft compiles it** (`npx heft build` produced `lib/probe/Probe2.module.scss.css`). Cause: the package's `exports` hide `dist/sass`; heft's `SassProcessor` rewrites `~x` to `pkg:x` and resolves with its own package resolver. Fix candidate: rewrite `~` to `pkg:` before sass-loader (or an importer that does it). Not filed in the KB/PLAN (out of scope for this task).

## Not verified

- No live SharePoint check (browser profile in use by another thread): rspfx's multi-bundle HMR loss, Fast Refresh per bundle, nested-React "Invalid hook call", ACE lazy chunk on the page, effect of over-declared `scriptResources`, and theme rendering are inferred from served bundles and our own R5 results, not observed on a page.
- rspfx's own test suite was not run; its Vite path (`rspfx dev:vite`, the default for new projects) and its build/package commands were not evaluated.
- Rows 10, 21, 22, 75, 76 are static guesses.
- rspfx performance was not measured.
