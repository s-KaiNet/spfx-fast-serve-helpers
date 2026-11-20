# Architecture review of the Rspack branch (`1.24.0-rspack.15`)

> **Implemented (2026-11-20, `1.24.0-rspack.16`): items #1, #2 and #3**, behaviour unchanged (same terminal output and served files on a spfx-rea copy; live and local checks passed). #4–#14 are open; the map in §2 describes `1.24.0-rspack.15`.
>
> - **#1** `src/featureApi/` (build/feature context, `ConfigContribution`, `Feature`, `ServerMiddleware`, page-channel types, `DIST_PATH`/`MANIFESTS_PATH`/`BROWSER_ERRORS_PATH`/`publicPath()`, `CORS_HEADERS`/`send`/`sendJson`/request helpers, which replaced `utils/http.ts`). `rspack/` keeps `features.ts` (ordered `FEATURES`), `config.ts`, `merge.ts`, `pageChannel.ts`, `problems.ts` (`problemLocation`/`tidyMessage`/`isCodeFile`, used by `server/` and `extend/`), `compile.ts`. Also `config/index.ts`; `session/` and `testing/` import `server/index.ts`.
> - **#2** every feature is `xFeature: Feature = { name, contribute }`; `serverStarted` left the contribution: features use `context.page` (`reloadPages()`, `addPageScript()`/`pageScripts()`, `onServerStarted()`), which the dev server connects after `start()`. `manifests` renders `page.pageScripts()`; `browserErrors` adds its script; the two reloader arrays are gone. Merge order is named (`inFeatureOrder`, `laterFeatureWins`, `firstOccurrenceInFeatureOrder`) and pinned by tests (feature list, React alias over a library alias, TypeScript rules before style rules).
> - **#3** `SpfxProject.codeRoots()` (`{ label, root, sourceDir, project }`, consumer first) used by `typescript`, `hmr`, `localization`, `externals`, `browserErrors`, the compile report and `describeSetup` (the reporter, compile report and deep-import check now take `codeRoots` instead of `libraryRoots`); `ProjectOptions.role: 'consumer' | 'library'` + `project.role` instead of `library: boolean`; `project.libraryComponent()` (memoised) replaces 3 `readLibraryComponent` calls on the project's own root; `createProject` (225 lines) split into `projectFiles.ts`, `bundles.ts`, `localizedResources.ts`, `projectTsconfig.ts`, `memo.ts` (`once`, `oncePerKey`) and is 37 lines; `ProjectLogger`/`ProjectRole` moved to `types.ts` (file cycle gone). Removed: `invalidate()`, `ProjectChange`, `aliasCandidates`, `matchesPathAlias` with their helpers, `readTsconfigPaths`, `TsconfigPaths.pathsBase`.
> - Metrics (same scripts on copies, madge 8 via `pnpm dlx`): folder SCCs 1 × 15 folders (5 with runtime imports) → **0**; file cycles 1 → **0** (madge agrees); imports bypassing a folder `index.ts` 49 → **4** (the public `index.ts` type imports and `runCli.ts`'s two direct `extend/` imports, kept to avoid loading `@rspack/core` for `--help`); `project/project.ts` 363 → 163 lines; largest file now `browserErrors/runtime/pageRuntime.ts` 279; functions over 45 lines: `createProject` gone, others unchanged; production modules 107 → 120.

Date: 2026-11-20. Research only: nothing in `src/`, `test/`, `kb/` or `package.json` was changed. Inputs: `research/HANDOFF.md`, `kb/architecture/*`, `README.md`, every file in `src/`, an import graph built by a script, madge 8 (`pnpm dlx`, run on a copy in `/var/tmp/arch-review/`), oxlint size/complexity rules (temporary config, outside the repo), and an export-usage scan.

## Verdict

**The structure is already good, and a big restructuring would not pay off.** The code is small and readable: 106 production modules, median about 40 lines, the largest 363. Most features follow the same "pure functions + thin Rspack glue" split. The project model really is bundler-free. The logger is injected, tests sit next to the code, and the code reads well without comments. The problems are a few **seams**, not the layout:

1. `src/rspack/` does two jobs: it is the *feature API* every feature imports, and it is the *composition root* that imports every feature. This creates one strongly connected component of 15 folders (5 of them with runtime imports) and forces 49 imports to bypass folder `index.ts` files.
2. Features are wired together ad hoc: one feature returns a different shape, one takes another feature's output as a parameter, and the page-reload plumbing is copied in two places.
3. The project model is one 225-line closure. Its library mode is a boolean flag, and 7 callers rebuild the "project + linked libraries" list themselves.
4. The dependency rules in the KB are not enforced. `project.invalidate()` and other dead code still advertise behaviour that no longer exists.

Fixing items 1–5 of the ranked list costs about **2–3 days**. It makes the folder graph acyclic and turns the KB's dependency rules into a test. It also prepares the two likely extensions, SPFx 1.23/1.25 and more library or component work, without moving most files.

## 1. Best practices and how far they fit here

| Practice | Source | Fits this CLI? |
|---|---|---|
| Thin process shell: argv, stdout/stderr, exit codes and signals only at the entry point; library code doesn't call `process.exit` | clig.dev; lirantal/nodejs-cli-apps-best-practices; Salman handbook | **Yes, already done** (`cli.ts` vs `runCli.ts`) |
| Exit codes: 0 success, 1 failure, 2 usage, 130 after Ctrl+C | clig.dev; Kieran Potts TS-16 | Partly. Usage errors return 1; a graceful Ctrl+C exits 0 (fine for a dev server) |
| Ctrl+C: say something immediately, put a timeout on clean-up, let a second Ctrl+C force the exit | clig.dev "Signals" | Partly. The second Ctrl+C works implicitly (`once` removes the listener, so Node's default kill applies), but clean-up has no timeout or message |
| Config precedence: flags > environment > project config > defaults; tell the user which file was loaded | clig.dev; Practical Developer checklist | **Yes** (flags > `fast-serve/config.json` > `config/serve.json` > defaults, tested; the startup summary prints the result) |
| Separate expected (user/operational) errors from bugs; one app error class extending `Error` | goldbergyoni/nodebestpractices 2.2; Kieran Potts TS-16 | **Worth adding cheaply** (today every error is reduced to `.message`, so a bug loses its stack) |
| Functional core, imperative shell | functional-architecture.org (Bernhardt) | **Yes, mostly followed**. Keep it as the rule for new code |
| Composition root, pure DI without a container | Seemann, "Composition Root" | **Yes**. Already done by hand (`cli.ts` → `startDevSession` → `createRspackBuild`). A DI container would be over-engineering |
| Ports and adapters | Cockburn | **Only at real seams**: the logger, the dev server, the project-installed heft packages. A bundler-agnostic port is over-engineering, because the Vite line is a separate branch, not a second adapter |
| Plugin/contribution pipeline with named units, ordered hooks, server hooks | Rsbuild `setup(api)` + `modifyRspackConfig`/`onAfterStartDevServer`; Vite `configureServer`, `enforce`; Astro `astro:config:setup`/`updateConfig`; Heft task plugins; Storybook `Builder.start/build` | **Yes, lightweight**. Today's `ConfigContribution` is already this pattern. Give it one shape and a name; no public plugin API, no hook registry |
| Feature folders + an explicit allowed-dependency matrix, checked automatically | Nx `enforce-module-boundaries`; dependency-cruiser; RottenWiFi "enforce clean architecture"; lastminute.com | **Yes, as a vitest test with no new dependency**. Nx tags are overkill for one package |
| Barrel files cost load time and hide cycles | Marvin Hagemeister, "The barrel file debacle" | Here: 23 small `index.ts` files, so speed doesn't matter. The cost is in clarity: barrels re-export test-only internals and can't be used for `rspack/` because of the cycle |
| Strategy/table instead of scattered conditionals for variants (SPFx minor, component kind) | 1.23 research's "SPFx profile" | **Yes, when the second SPFx minor arrives** |
| Facade per external toolchain (heft config loader, SassProcessor, certificate) | Heft architecture docs (plugins/rigs are version-specific) | **Later**, together with SPFx 1.23/1.25 support |

Over-engineering for a ~6k-line dev-server CLI: DI containers, an event bus, a generic bundler abstraction, class hierarchies for features, a monorepo split, API Extractor for a public API of one function, and separate packages per feature.

## 2. Map of the current implementation

### Metrics

| Metric | Value |
|---|---|
| Top-level folders in `src/` | 24 (29 with subfolders), plus 6 root files (`cli.ts`, `runCli.ts`, `shutdown.ts`, `logger.ts`, `packageInfo.ts`, `index.ts`) |
| Production modules | 106 `.ts` files, 6,049 lines (browser runtime 356 lines in 3 files; `src/testing/` kits 397 more lines in 3 files) |
| Module size distribution | 53 files ≤ 40 lines, 37 files 41–100, 16 files > 100 |
| Largest files | `project/project.ts` 363, `browserErrors/runtime/pageRuntime.ts` 279, `server/devServer.ts` 192, `session/devSession.ts` 184, `extend/load.ts` 184, `config/options.ts` 154, `browserErrors/index.ts` 153 |
| Largest functions (oxlint, > 45 lines) | `createProject` 225, `installFastServePage` 144 (browser), `startDevSession` 125, `createScssTypings` 75, `watchFiles` 54, `createAssetTypings` 51, `createOverlay` 50 |
| Highest complexity (> 12) | `resolveOptions` 24, `scanLibraries` 23, `loadOptionsFile` 19, `debugQuery` 14, `configText` 13, `stripJsonComments` 13 |
| More than 4 parameters | `deepLibraryImports` (5), `withExtend` (5), `formatDeclarationImportMessage` (5) |
| File-level cycles | **1**: `project/project.ts` ↔ `project/sassConfiguration.ts` (type-only, `ProjectLogger`); madge agrees |
| Folder-level cycles | **1 SCC of 15 folders** counting type imports (`rspack`, every config feature, `server`, `extend`, `manifests`, `browserErrors`…); **5 folders** with runtime imports only: `rspack ↔ manifests ↔ server ↔ extend ↔ browserErrors` |
| Imports bypassing a folder `index.ts` | 49 (mostly `../rspack/context.js` / `../rspack/contribution.js`) |
| Exports only used by tests | 28 of 327; plainly dead: `isIdentifier`, `errorTitle`, `aliasCandidates`, `matchesPathAlias` (Vite leftovers), `project.invalidate()` + `ProjectChange` |
| Tests | 51 files, 5,776 lines, 321 tests: 38 unit files (232 tests), 13 integration files with real Rspack compiles or dev servers (83 tests), 7 fixtures (179 files) |
| Code comments | none (the rule holds; every `//` and `/*` hit is inside a string) |

### Folder roles and dependency graph (production code)

```
cli.ts ──► runCli.ts ──► config, extend(files, webpackHint), project
   └────► session ──► setup ──► config, project
              ├────► server ──► rspack ──► 12 feature folders
              │         ├────► extend ──► server(compileReport)  ◄─ runtime cycle
              │         ├────► manifests (MANIFESTS_PATH)        ◄─ server → feature
              │         ├────► aces (banner), cache, setup(type)
              └────► extend, externals(localExternalFiles)

feature folders ──► rspack/context, rspack/contribution        ◄─ type cycle with rspack/config
manifests ──► externals (localExternalAssetName)
browserErrors ──► server/headers (CORS_HEADERS)                ◄─ feature → server internal
project ──► utils (incl. heftProject → @rushstack/terminal, logger)
```

The runtime cycle edges: `rspack/config.ts` imports `manifests` and `browserErrors`; those import `publicPathOf`/`DIST_PATH` from `rspack/context.ts`. `browserErrors` imports `CORS_HEADERS` from `server/headers.ts`. `server/debugUrl.ts` imports `MANIFESTS_PATH` from `manifests`. `server/devServer.ts` imports `extend`. `extend/load.ts` imports `problemLocation`/`tidyMessage` from `server/compileReport.ts`. `extend/index.ts` imports `DIST_PATH` from `rspack/context.ts`.

### The feature contribution pattern (`src/rspack/contribution.ts`)

- Good: one merge function, plain data (`entry`, `rules`, `plugins`, `alias`, `extensions`, `externals`, `middlewares`, `serverStarted`). Features don't touch the final config, and adding a rule-only feature is about 20 lines. This is the Rsbuild/Vite idea without a framework.
- Inconsistent:
  - Names and shapes vary: `xContribution(context)` for most features, `definesContribution()` with no context, an async `stylesContribution`, and `browserErrorsFeature()` returning `{ contribution, pageScript }`.
  - Some features take `Pick<BuildContext, …>`, others the whole context.
  - `manifestsContribution(context, browserErrors.pageScript)` is cross-feature wiring inside the composition root.
- Duplicated: `externals/index.ts` and `manifests/index.ts` each keep a `reloaders: PageReloader[]` array that is filled from `serverStarted`. `assets/index.ts` and `styles/scssTypings/index.ts` each run "create typings → `firstCompile.then(generateAll)` → `watchSourceFolder(src)` → `onStop(close)`". That is two recursive `fs.watch` calls on the same folder, and the methods are named differently (`fileAdded` vs `fileChanged`).
- Order matters but isn't stated: rules are concatenated and aliases use `Object.assign`, where the last one wins. The order lives only in the `featureContributions` array.
- Server types (`StartedServer`, `PageReloader`, `ServerStopper`) are defined in `rspack/contribution.ts`, so `server/headers.ts` imports a type from `rspack`.

### Project model

- Bundler-free as the KB says: no `@rspack` import. It does import heft's loader via `utils/heftProject.ts` (for `sass.json`), which brings in `@rushstack/terminal` and the `Logger` type.
- `createProject` is one closure of 225 lines with a string-keyed `Map<string, unknown>` cache and `as T` casts.
- `invalidate()` (about 35 lines) and `ProjectChange` are used only by tests. The KB says the session restarts with a fresh model instead, so the code advertises a behaviour that is gone.
- Library mode is `ProjectOptions.library: boolean`, which branches inside `roleModelFiles()` and `bundles()`.
- `config/config.json` is read by `buildConfig()` and again by `readLibraryComponent()`, which is called from 5 places (`project.ts` ×3, `libraries.ts`, `setup/prepareServe.ts`).
- "Project plus linked libraries" is rebuilt by 7 callers: `typescript`, `hmr` (source folders), `localization` (resource owners), `externals`, `browserErrors`, `server/devServer.ts` (compile-report roots) and `setup/describeSetup.ts`.
- `tsconfigPaths.ts` still has `aliasCandidates`/`matchesPathAlias` and best-mapping logic. Only the tests use them; Rspack uses `resolve.tsConfig`.

### Config and options flow

`runCli` (parseArgs → `FastServeOptions`) → `prepareServe` (version check, `loadOptionsFile`, `createProject`, `resolveOptions(cli, file, serve.json)`, warnings) → `ServeSetup` → `prepareDevServer` (`BuildContext` = root, project, the `origin/locale/overlay` subset, logger). The flow is clean and testable: `resolveOptions` is pure and returns `warnings` as data.

Adding one option touches 6 places: the `FastServeOptions` type, the `parseArgs` table, the mapping in `runCli`, the help text, the `loadOptionsFile` key chain plus its "supported: …" string, and `resolveOptions`. `config/options.ts` also owns `FAST_SERVE_FOLDER`, which `extend/files.ts` imports.

### Error handling, logging, signals, shared state

- Errors: plain `Error` with good user-facing text, plus one custom `ExtendLoadError` (file + dependencies, used for restart recovery). `runCli` prints `[fast-serve] ${message}` for any error, so a programming error loses its stack. Exit codes are only 0 and 1.
- Logging: a `Logger { info, warn, error }` port injected everywhere. Narrow views exist: `ProjectLogger`, a duplicate `ExternalsLogger`, `Pick<Logger, 'error'>`. There is no debug/verbose level. Colours are applied in `logger.ts` and `browserErrors/format.ts`.
- Signals: `closeOnShutdownSignal` (SIGINT/SIGTERM via `once`, a `closing` guard, exit 0/1). There is no message and no timeout during clean-up. `onRestartFailed` exits with 1.
- Shared state: module-level caches in `packageInfo.ts` and `browserErrors/pageScript.ts` (fine). Plugin objects carry state across features (`BundleExternals`, `BrowserErrorsPlugin.compileFailed` as a public mutable field). Private fields mix TS `private` (browserErrors) and `#` (everything else).

### Browser runtime split

`src/*/runtime/` (`browserErrors`, `hmr`, `styles`) is compiled by `tsconfig.runtime.json` (DOM lib, no Node types) and excluded from the Node build. The split is clear and correct. Two caveats:

- The `src/*/runtime` glob matches only one level deep; this is a convention to keep, not a rule anything checks.
- `pageScript.ts` strips imports and exports from the runtime source with regexes at run time. It is tested, but fragile if the runtime ever imports something.

### Tests

- Tests sit next to the code, are named after behaviour, and come with good kits (`compileKit`, `devServerKit`, `fakePage`).
- Integration tests aren't marked as such, so there is no fast "unit only" run.
- The integration tests depend on the repo's own `node_modules` through symlinks. That proved fragile during this review: something outside this task (a `bun.lock` appeared and disappeared, and real folders such as `node_modules/@rushstack/heft` and `@microsoft/load-themed-styles` appeared at 17:05) changed `node_modules`. After that, 3–4 integration tests failed with "`@microsoft/sp-css-loader` was not found" and a timeout. That is an environment problem, not a code regression; I didn't repair it because this task is research only.

### Public API

`src/index.ts` exports `defineConfig` (3 overloads), `rspack`, a few Rspack types and the `FastServe*` context types, with types built from `index.ts` alone (`tsconfig.types.json`) and guarded by `publicApi.test.ts`. It is small and correct; keep it.

### Readability without comments

Good overall: names carry intent (`KEEPS_RUNNING`, `cssAfterHeftSourceMapLoader`, `withPersistentCache`, `serveConfigurationWarnings`), and functions are short. The places where the *why* is invisible are mostly configuration literals:

- the base config in `rspack/config.ts`: `{ test: /\.m?js$/, resolve: { fullySpecified: false } }`, `exportsPresence: 'auto'`, `optimization.nodeEnv: false`, `HEFT_RESOLVE_EXTENSIONS`, `IGNORED_PROJECT_FOLDERS`;
- `hashSalt: String(Date.now())` in `session/devSession.ts`, where the hot-update file names must change across restarts;
- `withExportNames` counting skipped components.

Without comments, the fix is named fragments, e.g. `amdOutput(context)`, `heftCompatibleResolve()`, `const UNIQUE_HOT_UPDATE_NAMES_PER_RESTART = …`, plus tests named after the reason.

## 3. Assessment

### Keep (already good)

- The data flow config → model → artifacts → Rspack → browser runtime, and its folder names.
- The bundler-free project model, with a test against heft output.
- The functional core in features: `debugManifests.ts`, `scriptResources.ts`, `compileReport.ts`, `debugUrl.ts`, `serveConfigurations.ts`, `exportNames.ts`, `cssClassName.ts`, `hostedWorkbench.ts` and `fingerprint.ts` are pure and unit-tested. Rspack glue sits in each `index.ts` and plugin class.
- The thin CLI shell with `CliIo` injection (`runCli` is fully testable) and testable signal handling (`SignalSource`).
- The `ConfigContribution` merge idea, the injected logger, the small public API, tests next to the code with real-compile integration tests, the runtime/Node tsconfig split, and the strict TypeScript settings.

### Inconsistent

- Feature function names, shapes and parameters (see §2).
- Folder `index.ts` used in some places and bypassed in others (49 bypasses).
- `private` vs `#`.
- `fileAdded` vs `fileChanged`.
- `SourceChange` vs `FileChange` (same shape).
- `projectRelative()` (in `extend/files.ts`) vs about 10 inline `toPosix(path.relative(...))` calls.
- Five spellings of "is in node_modules".
- Two `closeCompiler`, two `tryResolve` and two package-root URL constants.
- `findPackageDirectory` vs `findPackageFolder`; `readSafely` vs `readManifestSafely`; `realPath` vs `realDirectory`.
- Two `DEPENDENCY_FIELDS` lists with different members.

### Risky for future extension

| Extension | Where it hurts today |
|---|---|
| SPFx 1.23 or 1.25 (the 1.23 research recommends a per-minor "SPFx profile") | Version policy is tied to the package's own minor (`project/spfxVersion.ts`). The CSS-module regexes are hard-coded in `styles/index.ts` (1.23 treats every non-`.global` style as a module). React requests are fixed in `react/index.ts` (1.23: React 17, no `react-dom/client`). Project-installed heft internals are reached from 4 folders (`utils/heftProject.ts`, `project/sassConfiguration.ts`, `styles/scssTypings/heftSass.ts` with a deep `lib/SassProcessor` import, `assets/assetTypings.ts`) plus `server/certificate.ts` |
| New component types | Component types are strings in 6 places: `SUPPORTED_COMPONENT_TYPES` (`project.ts`), `LIBRARY_COMPONENT_TYPE` (`localLibraries.ts`), `ACE_COMPONENT_TYPE` (`aces/aceBanner.ts`), `componentLines` (`server/readyBanner.ts`), `describeComponent` (`setup/describeSetup.ts`), `LOCATION_EXTENSION_TYPES` (`setup/serveConfigurationWarnings.ts`) |
| More library-component work (workspaces, deployed libraries) | The "code roots" plumbing is repeated in 7 callers; library mode is a boolean inside the project closure |
| A new feature that needs a page script or a reload | It has to copy the reloader array, or be wired into `featureContributions` by hand like `browserErrors` → `manifests` |
| Another bundler | Unlikely, and the Vite line is a separate branch. Pure modules would carry over and each feature's `index.ts` would be rewritten. **Don't abstract for this** |

## 4. Ranked advice

Cost: S ≤ ½ day, M 1–3 days, L > 3 days.

### 1. Separate the feature API from the composition root (break the `rspack/` hub) — S–M, **now**

- **Problem:** `rspack/` is both what features import (`context.ts`, `contribution.ts`, `DIST_PATH`, `publicPathOf`) and what imports every feature (`config.ts`). Result: a 15-folder SCC and 49 index bypasses, because importing `rspack/index.ts` from a feature would be a runtime cycle. Server types live in `rspack/`, the server imports a feature constant (`MANIFESTS_PATH`), a feature imports a server internal (`CORS_HEADERS`), and `extend` imports `server/compileReport.ts`.
- **Change:** a small `src/featureApi/` folder that imports only types and constants. `rspack/` keeps assembly only.

```
src/featureApi/
  index.ts
  context.ts        BuildContext (root, project, options, logger, page, codeRoots)
  contribution.ts   ConfigContribution, Feature, ServerMiddleware, StartedServer
  urls.ts           DIST_PATH, MANIFESTS_PATH, BROWSER_ERRORS_PATH, publicPath(origin)
  http.ts           CORS_HEADERS, send, sendJson, requestPath
src/rspack/
  features.ts       the ordered feature list
  config.ts         base config + merge
  problems.ts       problemLocation, tidyMessage (used by server and extend)
  compile.ts
```

```ts
export const DIST_PATH = '/dist/';
export const MANIFESTS_PATH = '/temp/build/manifests.js';
export const BROWSER_ERRORS_PATH = '/fast-serve/browser-errors';

export function publicPath(origin: string): string {
  return `${origin}${DIST_PATH}`;
}
```

- **Benefit:** an acyclic folder graph (checked by hand: features → featureApi; rspack → features; server → rspack/extend; session → server). Every folder can be imported through its `index.ts`, and the KB rule "features don't reach into each other" becomes true.
- **Risk:** low. Moves and renames only, so tsc and the tests catch mistakes. It diverges slightly from the `v1.24` layout.

### 2. One feature shape and a page channel instead of hand wiring — S–M, **now** (together with #1)

- **Problem:** four different feature signatures; `browserErrorsFeature` returns a special shape; `manifestsContribution(context, pageScript)`; two copies of the reloader array; order-dependent merges that nothing names.
- **Change:** a named `Feature` with one `contribute(context)` method. Cross-feature needs go through a small `PageChannel` that the build creates and the dev server connects to when it starts (the same "server access" idea as Vite's `configureServer` and Rsbuild's `onAfterStartDevServer`).

```ts
export interface Feature {
  readonly name: string;
  contribute(context: BuildContext): ConfigContribution | Promise<ConfigContribution>;
}

export interface PageChannel {
  addScript(render: () => string): void;
  renderScripts(): string;
  reload(): void;
}

export function createPageChannel(): PageChannel & { connect(reload: () => void): void } {
  const scripts: (() => string)[] = [];
  let reloadPages: (() => void) | undefined;
  return {
    addScript: (render) => {
      scripts.push(render);
    },
    renderScripts: () => scripts.map((render) => render()).join(''),
    reload: () => reloadPages?.(),
    connect: (reload) => {
      reloadPages = reload;
    },
  };
}
```

```ts
export const FEATURES: readonly Feature[] = [
  entriesFeature,
  localLibrariesFeature,
  typescriptFeature,
  externalsFeature,
  reactFeature,
  localizationFeature,
  assetsFeature,
  stylesFeature,
  definesFeature,
  browserErrorsFeature,
  manifestsFeature,
  hmrFeature,
];
```

  `externals` and `manifests` call `context.page.reload()`. `browserErrors` calls `context.page.addScript(...)`, and `manifests` renders `context.page.renderScripts()` at request time, so neither feature knows about the other. Add a `config.test.ts` case that pins the order-sensitive results: the React alias wins over a library alias, and the rule order is TypeScript → styles.
- **Benefit:** adding a feature is one folder plus one line. No feature knows another feature, and the special cases disappear.
- **Risk:** low to medium (page reload and page-script timing). It is covered by the existing dev-server, HMR and browser-error integration tests.

### 3. Project model: code roots, explicit library role, typed memo, remove dead code — M, **now** (before more library or SPFx-version work)

- **Problem:** the 225-line `createProject` closure with string cache keys and casts; library mode as a boolean; 7 callers rebuilding "project + linked libraries"; `config/config.json` parsed in two ways; `invalidate()`/`ProjectChange` and the tsconfig alias functions are dead in production.
- **Change:**
  - Keep `SpfxProject` as the façade, but build it from small pure readers (`readers/packageJson.ts`, `readers/bundles.ts`, `readers/localizedResources.ts`, …) and a typed `once()`.
  - Add `codeRoots()`.
  - Split `createProject` / `createLibraryProject` instead of `library: true`.
  - Parse `config/config.json` once (`readBuildConfig(root)`) and derive the library component from it.

```ts
export function once<T>(compute: () => T): () => T {
  let state: { value: T } | undefined;
  return () => (state ??= { value: compute() }).value;
}

export interface CodeRoot {
  readonly label: string;
  readonly root: string;
  readonly sourceDir: string;
  readonly project: SpfxProject;
}
```

  `typescript`, `hmr`, `localization`, `externals`, `browserErrors`, the compile report and `describeSetup` then read `project.codeRoots()`. Delete `invalidate`, `ProjectChange`, `aliasCandidates`, `matchesPathAlias` and their tests, and update the KB's "Caching and invalidation" paragraph in the same task.
- **Benefit:** the most-changed module becomes readable at a glance; library work touches one place; about 90 production lines of dead code (plus their tests) go away.
- **Risk:** medium. The model is central, but it has strong unit tests and the heft snapshot script (`research/rspack/scripts/model-snapshot.mjs`) to re-check against heft.

### 4. Make the dependency rules executable — S, **now** (right after #1)

- **Problem:** the KB states the rules ("the model never imports Rspack; features don't depend on each other's internals"), but nothing checks them, and they were already broken (`browserErrors → server/headers`, `extend → server/compileReport`).
- **Change:** an `architecture.test.ts` that reuses the import scan from this review (no new dependency) and checks an allowed-folder matrix, no cycles, `index.ts`-only access across folders, no `@rspack/*` in `project`/`config`/`setup`, and nothing from `node:*` in `*/runtime`. This is the Nx/dependency-cruiser idea at the scale of one package.

```ts
const ALLOWED: Readonly<Record<string, readonly string[]>> = {
  utils: [],
  project: ['utils'],
  config: ['project', 'utils'],
  featureApi: ['config', 'project', 'utils'],
  rspack: ['featureApi', 'features', 'config', 'project', 'utils'],
  server: ['rspack', 'featureApi', 'extend', 'cache', 'setup', 'aces', 'config', 'project', 'utils'],
  session: ['server', 'setup', 'extend', 'externals', 'config', 'project', 'utils'],
};

test.each(Object.entries(importsByFolder()))('%s imports only allowed folders', (folder, targets) => {
  expect(targets.filter((target) => !isAllowed(folder, target))).toEqual([]);
});
```

- **Benefit:** the structure can't erode silently, and the rules are documented in code.
- **Risk:** none. Occasional matrix updates are a feature, not a cost.

### 5. Expected vs unexpected errors, explicit shutdown — S, **now**

- **Problem:** every failure prints only `.message` with exit code 1, so a bug shows up as a one-line message with no stack, which is hard to support. Clean-up after Ctrl+C has no timeout or message.
- **Change:** a `FastServeError` for expected failures (bad option, unsupported SPFx, missing certificate, port in use, `ExtendLoadError` extends it). `runCli` prints the message for those and the stack plus "please report" for anything else. Exit 2 for usage errors from `parseArgs`. Print "stopping…" on the first signal, put a 5 s timeout on `session.close()`, and make the second signal force-exit explicitly instead of relying on Node's default.

```ts
export class FastServeError extends Error {
  override readonly name: string = 'FastServeError';
}

export function describeFailure(error: unknown): string {
  if (error instanceof FastServeError) return error.message;
  return `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\nThis looks like a fast-serve bug: please report it with the output above.`;
}
```

- **Benefit:** better bug reports, and it follows clig.dev and nodebestpractices.
- **Risk:** low. The 28 `throw new Error` sites in production code are reviewed, and the expected ones change class; the message text stays the same.

### 6. One source-folder watcher for generated typings — S, soon

- **Problem:** `assets/index.ts` and `styles/scssTypings/index.ts` duplicate the typings lifecycle and open two recursive watchers on `src`. `utils/sourceWatcher.ts` and `session/fileWatcher.ts` define the same change type twice.
- **Change:** a `TypingsGenerator { generateAll(); fileChanged(file); fileRemoved(file) }` interface and a `generatedTypingsFeature(generators)` that owns one watcher per distinct folder; one shared `FileChange` type in `utils/watch.ts`.
- **Benefit:** less code, one watcher fewer, and new generated typings (e.g. JSON or SVG typings) are one line.
- **Risk:** low.

### 7. SPFx profile and component-kind table — S–M, **later** (with the first SPFx 1.23/1.25 task; the kind table can be done now)

- **Problem:** version policy, CSS-module rules and React entry points are hard-coded in three folders, and component types are strings in 6 places (§3).
- **Change:** `project/spfxProfile.ts`, selected from the installed version, and `project/componentKinds.ts`.

```ts
export interface SpfxProfile {
  readonly minor: string;
  readonly moduleCss: RegExp;
  readonly globalCss: RegExp;
  readonly reactRequests: readonly string[];
}

export const COMPONENT_KINDS = {
  WebPart: { label: 'web parts', served: true },
  Extension: { label: 'extensions', served: true },
  AdaptiveCardExtension: { label: 'Adaptive Card Extensions', served: true },
  Library: { label: 'library components', served: false },
} as const satisfies Record<string, { label: string; served: boolean }>;
```

- **Benefit:** supporting another minor becomes mostly data plus tests (what the 1.23 research estimated at M).
- **Risk:** low.

### 8. One folder for project-installed heft/SPFx toolchain adapters — S–M, **later** (with #7)

- **Problem:** loading the project's `@rushstack/*` and `@microsoft/sp-css-loader` (version-sensitive, partly deep internal paths) is spread over `utils/heftProject.ts`, `project/sassConfiguration.ts`, `styles/scssTypings/heftSass.ts`, `assets/assetTypings.ts`, `styles/index.ts` and `server/certificate.ts`. As a side effect, `project` depends on `@rushstack/terminal` and the logger through `utils`.
- **Change:** `src/heft/` with `projectLoader.ts`, `sassConfiguration.ts`, `sassProcessor.ts`, `staticAssetTypingsConfiguration.ts`, `cssLoader.ts` and `certificate.ts`, each returning plain data or narrow interfaces (ports and adapters only where the outside world really changes per version).
- **Benefit:** one place to look when an SPFx minor changes heft internals.
- **Risk:** low.

### 9. Split `config/options.ts` and keep one list of option names — S, later (when the next option is added)

- **Problem:** six edit points per option; `resolveOptions` complexity 24 and `loadOptionsFile` 19; `FAST_SERVE_FOLDER` is owned by options but used by `extend`.
- **Change:** `config/paths.ts` (folder and file names), `config/optionsFile.ts`, `config/flags.ts` (the parseArgs table and mapping), `config/resolve.ts`, and `config/servePage.ts` (serve-configuration selection and the page precedence). A small `FILE_OPTIONS` table `{ key, type }` drives `loadOptionsFile` and its "supported: …" message. Keep the help text hand-written: readable help beats generated help here.
- **Benefit:** smaller functions, and adding an option means touching 3 places instead of 6.
- **Risk:** low.

### 10. Narrow `server/devServer.ts` and `session/devSession.ts` — S–M, later

- **Problem:**
  - `prepareDevServer` loads the certificate, builds, merges the extend file, decides on the persistent cache and creates the compiler.
  - `listenDevServer` starts the server, logs compiles, runs hooks and prints the banner, so the server folder imports `aces`, `manifests`, `extend`, `cache` and `setup`.
  - `startDevSession` is a 125-line closure.
- **Change:**
  - `rspack/createCompiler.ts` (build + extend + cache → compiler);
  - `server/devServer.ts` (`RspackDevServer` lifecycle only);
  - `server/compileLog.ts` (the `done`/`failed` taps);
  - move the ready banner to `setup/` next to `describeSetup`;
  - `session/generation.ts` (prepare/dispose one server generation) plus a tiny serial restart queue.
- **Benefit:** each file has one reason to change, and the server folder stops depending on features.
- **Risk:** low to medium (restart behaviour). It is well covered by `devSession.test.ts`.

### 11. Folder `index.ts` and export hygiene — S, now (falls out of #1)

- **Problem:** barrels re-export internals that only tests use (28 exports), and some dead exports remain (`isIdentifier`, `errorTitle`, `findExtendFile`, `startDevServer` used only by tests, `readTsconfigPaths`).
- **Change:** rule: `index.ts` is the folder's public surface for *other folders*; tests import the module next to them directly; delete the dead exports.
- **Benefit:** each `index.ts` tells a reader what the folder offers.
- **Risk:** none.

### 12. Small duplication clean-ups — S, opportunistic

- One `isInNodeModules(file)` and `NODE_MODULES` in `utils/paths.ts`.
- One `closeCompiler`/`runCompiler` in `rspack/compiler.ts` (`compile.ts`, `extend/load.ts`, `server/devServer.ts`).
- `utils/packages.ts` with `findPackageDirectory`, `tryResolve`, `readPackageJson`, `realPathOr` and `PACKAGE_ROOT`.
- Use `projectRelative` everywhere.
- One private-field style (`#`).
- Merge `ExternalsLogger` into `ProjectLogger`.
- Named fragments for the base Rspack config (readability without comments, §2).

### 13. Test layout: mark integration tests, guard their environment — S, later

Name real-compile tests `*.integration.test.ts` and add vitest `projects` (`unit`, `integration`) so `pnpm test:unit` runs in a few seconds. Make `compileKit` fail fast with one clear message when the repo's dev dependencies (`@microsoft/sp-css-loader`, heft plugins) are missing or broken, instead of four confusing assertion diffs (seen during this review).

### 14. Group feature folders under `src/features/` — M, **not now** (optional)

It would make the layers visible in the tree (`src/` would list about 12 entries instead of 24). Most of the benefit comes from #1 and #4 without moving 13 folders, rewriting every import and diverging from the `v1.24` layout. Reconsider only if the matrix in #4 gets hard to read.

### Not worth doing

- A DI container or service locator: the hand-written composition root is clearer.
- A bundler-agnostic port/adapter layer.
- A public plugin API or hook registry: the extend file covers users, and internal features don't need a framework.
- An event bus.
- Class hierarchies for features.
- Splitting into packages.
- Replacing `node:util` `parseArgs` with a CLI framework: there is one command and 7 flags.

### Target tree (after #1–#4, #6, #7; files not listed stay where they are)

```
src/
  cli.ts  runCli.ts  shutdown.ts  logger.ts  packageInfo.ts  index.ts  errors.ts
  config/            paths.ts  optionsFile.ts  flags.ts  resolve.ts  servePage.ts
  project/           index.ts  project.ts  codeRoots.ts  once.ts  spfxProfile.ts  componentKinds.ts
                     readers/ (packageJson, buildConfig, bundles, manifests, localizedResources, serveConfigurations, configExternals, libraries, tsconfig)
  heft/              (later, #8)
  setup/             prepareServe.ts  describeSetup.ts  readyBanner.ts  serveConfigurationWarnings.ts
  session/           devSession.ts  generation.ts  restartTriggers.ts  fileWatcher.ts
  server/            devServer.ts  compileLog.ts  certificate.ts  port.ts  debugUrl.ts
  featureApi/        index.ts  context.ts  contribution.ts  pageChannel.ts  urls.ts  http.ts
  rspack/            features.ts  config.ts  problems.ts  compile.ts  createCompiler.ts
  cache/  extend/
  entries/  libraries/  typescript/  externals/  react/  localization/  defines/  hmr/
  assets/  styles/  typings/ (shared generated-typings feature, #6)  manifests/  browserErrors/  aces/
  utils/             paths.ts  packages.ts  jsonc.ts  guards.ts  watch.ts  heftProject.ts (until #8)
  testing/
```

## 5. Sources

- Command Line Interface Guidelines (clig.dev): exit codes, signals and Ctrl+C, configuration precedence. https://clig.dev/
- lirantal, Node.js CLI Apps Best Practices: POSIX signals, exit codes. https://github.com/lirantal/nodejs-cli-apps-best-practices
- Kieran Potts, TS-16 Command Line Interfaces: user vs internal errors, 0/1/2/130. https://kieranpotts.com/standards/016
- The Practical Developer, Building CLI tools in Node.js: precedence and the "tell which config was loaded" checklist. https://the-practical-developer.online/posts/building-cli-tools-nodejs-production/
- goldbergyoni, Node.js Best Practices 2.2, extend the built-in Error. https://github.com/goldbergyoni/nodebestpractices
- Rsbuild plugin hooks and plugin development (`setup(api)`, `modifyRspackConfig`, `onAfterStartDevServer`, hook order). https://rsbuild.rs/plugins/dev/hooks, https://rsbuild.rs/plugins/dev/
- Vite Plugin API (`configureServer`, `enforce`, `apply`). https://vite.dev/guide/api-plugin
- Astro Integration API (`astro:config:setup`). https://docs.astro.build/en/reference/integrations-reference
- Heft architecture (phases, tasks, task and lifecycle plugins). https://heft.rushstack.io/pages/intro/architecture
- Storybook Builder API (`start`/`build`/`bail`). https://storybook.js.org/docs/builders/builder-api
- Functional core, imperative shell. https://functional-architecture.org/functional_core_imperative_shell
- Mark Seemann, Composition Root. https://blog.ploeh.dk/2011/07/28/CompositionRoot
- Alistair Cockburn, Hexagonal architecture (ports and adapters). https://alistair.cockburn.us/hexagonal-architecture
- Marvin Hagemeister, The barrel file debacle. https://marvinh.dev/blog/speeding-up-javascript-ecosystem-part-7
- Nx, Enforce module boundaries and project dependency rules. https://nx.dev/docs/features/enforce-module-boundaries, https://nx.dev/docs/concepts/decisions/project-dependency-rules
- lastminute.com, enforcing boundaries with dependency-cruiser (index-only access, layer rules). http://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app
- Earlier in-repo research: `research/spfx-1.23/README.md` (per-minor SPFx profile), `research/rspack/library-components.md`.

## 6. How this was produced

- Import graph: a Node script over `import`/`export … from` (folder edges, type-only vs runtime, index bypasses, Tarjan SCCs at folder and file level), in `/var/tmp/arch-review/graph.mjs` and `graph2.mjs`.
- Cycles cross-checked with `pnpm dlx madge@8 --circular` on a copy of `src/`.
- Function size, parameter count and complexity: `oxlint` with a temporary config (`max-lines-per-function` 45, `max-params` 4, `complexity` 12, `max-depth` 4).
- Exports: a usage scan (`/var/tmp/arch-review/exports.mjs`) that separates production use, test-only use and no use.
- Tests: `pnpm -s test` ran 321 tests in 51 files. 317–318 passed; 3–4 integration tests failed because `node_modules` was changed by something outside this task (see §2 "Tests"), not by code changes. No live SharePoint checks (not needed for this review).
