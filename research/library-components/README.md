# Research: library components in fast-serve (Vite)

Date: 2026-11-18. Sources: classic spfx-fast-serve-helpers at `ee3b60b^` (`src/common/helpers.ts` `extractLibraryComponents`, `src/common/settingsManager.ts`, `src/webpack/baseConfig.ts`, `src/plugins/DynamicLibraryPlugin.ts`), the spfx-fast-serve guide [docs/LibraryComponents.md](https://github.com/s-KaiNet/spfx-fast-serve/blob/main/docs/LibraryComponents.md) and README option table, Microsoft Learn ["Build solutions with the library component type"](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/library-component-tutorial), `@microsoft/spfx-heft-plugins` 1.24.1 (`spfxManifests/cumulativeManifestProcessor/CumulativeManifestProcessor.js`, `ManifestUrlProcessor.js`, `plugins/webpackConfigurationPlugin/updateServeConfigAsync.js`), `@microsoft/sp-loader` 1.24.1 dist, two generated projects under `/tmp/libc` (`@microsoft/generator-sharepoint` 1.24.1), a prototype, and live checks on `mastaq.sharepoint.com/sites/dev` (hosted workbench, nothing saved).

## Answer

- **Recommended: option B, "library source in the consumer's graph".** `fast-serve` in the consumer finds dependencies that are *local SPFx library projects* (the package realpath is outside `node_modules` and has `config/config.json` with a `"Library"` component: `npm link`, npm `file:`, pnpm `link:`/`workspace:`, yarn/npm workspaces, Rush) and resolves the package to the library's `src` entry, with the library's loc strings (and later its tsconfig `paths`, `require()` handling, typings). **One command, zero config.** Libraries installed from a registry keep today's path (facade → `loadComponentById` → tenant app catalog).
- **Prototype works live:** library TS edit → hot update; a React component exported by the library → **Fast Refresh with state kept**; library SCSS → hot swap with tenant theme tokens; library loc edit → page reload (same as the consumer's own loc). No library build needed.
- **Effort: M** (about the size of the extensions work). Plus one **S bug fix needed anyway**: today a linked library breaks the consumer (`does not provide an export named …`), because export names of an ESM `main` aren't read.
- The heft/classic way (load the library as a separate SPFx component from its `dist/`) is **wrong for us**: we serve a dev copy of React, the library's `dist` uses the tenant's React, so any hook in a library component fails (**verified live: React error #321 "Invalid hook call"**). The same applies to libraries loaded from the app catalog: a known limitation to document (and maybe fix later, see Risks).
- `fast-serve` inside the library project alone: phase 2. For now, print a clear message ("run fast-serve in a project that depends on this library").

## Comparison

| | A: library as SPFx component (heft/classic) | **B: library source in the consumer graph** | C: workspace mode (several projects, one server) |
|---|---|---|---|
| Commands | 2 (library watcher/server + consumer) | **1** | 1 (at the repo root) |
| Config | ports, start order, manifest chaining | **none** (auto-detected) | a workspace option/root detection |
| What the page runs | dev library from localhost (debug manifest wins version resolution) | library source inside the consumer's bundle graph; the SPFx library component isn't loaded at all | like B, for all projects |
| React | **broken for hooks** (tenant React in the library vs dev React in the consumer; verified) unless the library is also served with a React bridge | one dev React (`resolve.dedupe`), works (verified) | one dev React |
| HMR | library edit → reload at best; two Vite clients and two refresh runtimes if both are Vite | **Fast Refresh across projects** (verified) | same as B |
| Prod fidelity | high (separate component, own version, `loadComponentById`) | lower: library code is a module of the consumer; one instance per server graph, not per page | like B |
| Library alone | yes (serve its manifest) | no (needs a consumer; phase 2 adds a library mode) | yes, if a consumer is in the workspace |
| Effort | L (shim/manifest for Library type, second server, manifest chaining, React bridge) | **M** | L (multi-project model in every module) |

## 1. Classic spfx-fast-serve (webpack, SPFx ≤ 1.21)

Workflow from the [guide](https://github.com/s-KaiNet/spfx-fast-serve/blob/main/docs/LibraryComponents.md) and the code at `ee3b60b^`:

1. Two projects, each with spfx-fast-serve. In the library: `fast-serve/config.json` with `"isLibraryComponent": true` and a unique port (the guide says anything except 4321; the code defaults to **4320** when `isLibraryComponent` is set, `settingsManager.ts`).
2. The consumer depends on the library by folder: `npm install ../spfx-library` (symlink).
3. Start the library's `npm run serve` first, wait for the full compile, then the consumer's. "The order is important."

How it worked (code):
- The library's dev server runs with `devMiddleware.writeToDisk: isLibraryComponent` (`baseConfig.ts`): it is only a **watch compiler that writes `dist/*.js` to disk**. Its own port is never used by the page.
- The consumer runs `gulp bundle --custom-serve` first, so SPFx writes `temp/build/manifests.json`, which already contains the linked library's manifest (SPFx's own manifest discovery). `extractLibraryComponents()` (`helpers.ts`) then finds every `type: "component"` script resource that isn't `@microsoft/`/`@ms/`, whose package has `config/package-solution.json` (a linked SPFx project), and adds a webpack-dev-server `static` entry serving `<package>/dist` at `/<relative path>/dist`, the URL SPFx put in the debug manifest.
- So the page gets **one** debug manifest (the consumer's), the library is loaded as a real SPFx component by `loadComponentById` from the consumer's server, and library edits reach the page through the on-disk `dist` (webpack-dev-server `static` watches by default → live reload: inferred, not tested). No HMR across projects.
- `DynamicLibraryPlugin` (renaming `define("<guid>")`) was dead code (`@deprecated Since SPFx 1.19`, body commented out).

## 2. SPFx 1.24 (heft)

Hands-on with `/tmp/libc/corp-lib` (library) and `/tmp/libc/corp-wp` (React web part), `npm install ../corp-lib` (npm `file:` → symlink):

- **Library project:** generator output is a normal SPFx project with a bundle `corporate-library-library` (entry `./lib/index.js`), manifest `componentType: "Library"`, `version: "*"` (package version), `localizedResources`, `serve.json` port 4321. The generated `package.json` has **no `main`** (Microsoft's tutorial says `"main": "lib/index.js"` is needed; added by hand). `heft build` writes `dist/<id>.manifest.json` with `internalModuleBaseUrls: ["https://localhost:4321/dist/"]`, script resources for its own bundle, its loc file and its externals (`@microsoft/sp-core-library`, `react` as `type: "component"`), and `dist/corporate-library-library.js` = `define("<id>_<version>", [...])`. Library SCSS is compiled into the library bundle (`loadStyles` with theme tokens).
- **Consumer:** the import `corp-lib` becomes an external: the bundle's `define([... "corp-lib"])`, and the manifest gets `"corp-lib": { "type": "component", "id": "002649f3-…", "version": "0.0.1" }` (verified in `dist/*.manifest.json`). At runtime SharePoint resolves it like `sp-*`: same major, ≥ requested, **a debug manifest wins** over a deployed one ([05-runtime-loader](../spfx-pipeline/05-runtime-loader.md) §3). In production: the library `.sppkg` is deployed tenant-wide; updating the library updates all consumers without rebuilding them (Microsoft Learn).
- **Dev, heft:** the consumer's `manifests.js` contains every manifest found in its dependencies (`CumulativeManifestProcessor.discoverManifests`, symlinks preserved). For the linked library it contains the library manifest with `internalModuleBaseUrls: ["https://localhost:4321/node_modules/corp-lib/dist/", …]` (verified in `temp/build/manifests.js`). `heft start` serves the whole project folder, so `node_modules/corp-lib/dist/*.js` is served through the symlink. The library has to be built (`heft build`, `heft build --watch`, or `heft start` in the library, which also writes to disk: `writeToDisk: true` in `updateServeConfigAsync.js`). So heft also uses **one server/debug manifest for the page + a watcher in the library**, like classic.
- **One `debugManifestsFile` only:** sp-loader reads `new URL(location.href).searchParams.get("debugManifestsFile")` (one value) and checks it is a `localhost` URL (`sp-loader` dist). A second server would have to be chained by the first `manifests.js` (it is an AMD module, so `define(["https://localhost:4322/temp/build/manifests.js"], …)` could merge both: an idea, not tried).

## 3. Today's fast-serve with a linked library (verified live)

`project/libraries.ts` already treats a built linked library like `sp-*` (it ships `dist/*.manifest.json`), so the consumer gets an ESM facade calling `loadComponentById("002649f3-…", "0.0.1")`.
- It fails before that: `cannot read the exports of corp-lib … SyntaxError: Unexpected token 'export'` at start, then in the page `The requested module '/@id/__x00__spfx-library:corp-lib' does not provide an export named …`. Cause: `externals/exportNames.ts` only reads ESM exports from `module`/`exports.import`; an SPFx library's `main` (`lib/index.js`) is ESM, and evaluating it as a script throws. **Fix (S):** if the `main` entry parses with es-module-lexer and has exports, use them. This also matters for third-party SPFx libraries installed from npm and deployed to the app catalog.
- Even with the fix, `loadComponentById` would only find the library if it is deployed in the app catalog (we don't list it in our debug manifest), and its components would hit the React problem below.
- If the library was never built (no `dist/`), it isn't detected as a library at all and Vite bundles `lib/index.js` (or fails if there's no `lib/`): behaviour depends on build state.

## 4. Options

### A. Library as a real SPFx component (two servers or watcher, like heft/classic)

Variants: A0 = consumer's debug manifest lists the library manifest pointing at its `dist/` (needs `heft build --watch` in the library); A1 = `fast-serve` also runs in the library (Library shim + entry, own port) and the consumer's `manifests.js` lists (or chains) its manifest.

- **Prototype A0 (verified live):** an experiment plugin added the library's dist manifest (base URL on our server) to `manifests.js`, served `dist/`, and gave the consumer a facade with the right export names. The page loaded `002649f3-…_0.0.1` and its loc module through RequireJS. The class export worked, but **the library's function component crashed**: "The above error occurred in the `<CorporateCounter>` component", and calling it shows React error **#321 (Invalid hook call)**. The library's `react` maps to the tenant's `0d910c1c-…_18.3.1`; the consumer renders with Vite's dev React (`devReact.default === tenantReact` → `false`).
- A1 has the same problem in reverse unless both servers share one React; and it adds a second HMR client, a second refresh runtime, port/order handling, manifest chaining. HMR across projects would at best be "library edit → reload".
- Pro: closest to production (separate component, own version, one instance per page, real `loadComponentById` semantics).
- Possible React bridge (not tried): before `loadComponentById` of a non-Microsoft library, add a RequireJS `map` for the library's module id (`{ "<libId>_<ver>": { react: "<dev react module>" } }`) so the library gets the dev React. The SP loader writes its own `map` for the component while loading it, so this needs a hook into `require.config`: fragile.

### B. Library source in the consumer graph (recommended)

How (prototype, verified live): a `pre` resolver maps `corp-lib` → `../corp-lib/src/index.ts` (and `corp-lib/lib/x` → `src/x.ts`), before the externals facade; `server.fs.allow` gets the library root; `optimizeDeps.exclude` the package; a second `localizationPlugin` with a project model of the library resolves `CorporateLibraryLibraryStrings`. Everything else already worked unchanged: Oxc transform, `sp-*` facades for the library's imports, the CSS module naming and theme tokens (global `stylesPlugin`), React Fast Refresh (the library's files are outside `node_modules`), React dedupe.

Live results (hosted workbench, Consumer web part using `new CorporateLibraryLibrary()` and `<CorporateCounter />` from the library):

| Check | Result |
|---|---|
| render | library text from its loc file, `sp-core-library` facade OK, `.badge_…` class with tenant `themePrimary` |
| library class edit (`CorporateLibraryLibrary.ts`) | hot update, marker kept (bubbles to the consumer's Fast Refresh boundary `Consumer.tsx`) |
| library component edit (`CorporateCounter.tsx`) | Fast Refresh, counter state kept, marker kept |
| library SCSS edit | hot swap, marker kept |
| library loc edit | page reload (loc modules reload by design, `locModule.ts`) |

What the page sees: no library component at all; the library is a module of the consumer's graph. Production differences to document:
- one instance **per fast-serve graph**, not per page. All bundles of the consumer share it (like prod). A *different* solution on the same page that uses the deployed library gets the app catalog copy: two instances, so shared state/singletons aren't shared in dev;
- no version resolution: dev always runs the local source, whatever version is deployed;
- the library's own `config.json` externals, tsconfig `paths`, `require()` of assets, const-enum/type-only checks and terminal error forwarding need the library root treated as a project root (see the plan). The tsconfig transform options are global per server: warn when the library's differ.

Edge cases:
- **several consumers**: each consumer's fast-serve serves the library source itself; fine. Two consumers on one page = two servers, still one `debugManifestsFile` (C, or later);
- **library depending on another library**: apply the detection recursively (the resolver walks the library's dependencies); a registry-installed one stays a facade;
- **library's loc/SCSS**: loc via its `localizedResources` (done in the prototype); SCSS needs nothing; SCSS/static-asset typings for the library are optional (write them into the library's `temp/`);
- **library not linked** (registry package): today's facade + app catalog path, after the export-name fix; the React-hook limitation applies;
- **pnpm `file:` / yarn classic `file:`** copy the folder into `node_modules`, so they are not detected: document `link:`/`workspace:`/`npm link`/npm `file:`;
- the IDE still gets the library's types from its `lib/*.d.ts` (`main`): new exports need `tsc -w`/`heft build` in the library for the editor, not for fast-serve.

### C. Other ideas

- **Workspace mode:** `fast-serve` at a monorepo root (or `--with ../other-project`) serving the components of several SPFx projects from one server and one `manifests.js`. B is the first step of it (other projects' source in one graph); C adds their web parts/extensions as bundles. Later.
- **Manifest chaining:** one `debugManifestsFile` whose AMD module depends on the other servers' `manifests.js`. Enables A1 with one URL; doesn't fix React.
- **Library mode** (`fast-serve` inside the library): serve the library as a debug component (Library shim with `define("<id>_<ver>")`, debug manifest) so deployed consumers on the page pick up the dev library. Needs `react`/`react-dom` facades to the tenant React in that mode (no Fast Refresh, reload on edit). Phase 2, if users ask.

## 5. Recommendation and plan (B)

Effort **M**. Per module:

| Module | Change |
|---|---|
| `project/` | `localLibraries()`: walk dependencies (recursively for libraries), keep packages whose realpath is outside `node_modules` and whose `config/config.json` has a `"Library"` component; entry via `findSourceFile` (lib→src). Each gets a library project model (loc, tsconfig, `paths`, config externals; `Library` allowed without the "not supported" warning). `libraries()` excludes them. `modelFiles()`/`invalidate()` include the libraries' `package.json`, `config.json`, manifests, tsconfig |
| new `librarySources/` | `pre` resolver: package → src entry, `pkg/lib/*` → `src/*`; `server.fs.allow` + `optimizeDeps.exclude`; per-library tsconfig `paths` by importer location |
| `externals/` | export names from an ESM `main` (S, independent fix); library config externals merged into the debug manifest |
| `localization/` | merge `localizedResources` of the consumer and the libraries (warn on a name clash) |
| `transforms/`, `browserErrors/` | "project script" = inside the consumer root or a library root (`require()` transform, const enums from the library's `src/**/*.d.ts`, type-only names, project-frame rule incl. `/@fs/<library>/…` frames); warn if the library's tsconfig transform options differ |
| `styles/`, `assets/` | optional: SCSS/static-asset typings for library sources (in the library's `temp/`) |
| `server/`, `devServer.ts` | watch-ignore the library's `lib/ dist/ temp/`; print "libraries from source: corp-lib (../corp-lib)"; in a library-only project, a clear message instead of "No web parts…" |
| `config/` | optional escape hatch later (`"librarySource": false`, per package). Not needed for v1 |

Tests: unit tests with `test/fixtures` (a consumer fixture with a symlinked library fixture: detection incl. nested and registry libraries, resolution of `pkg` and `pkg/lib/x`, loc merge, export names of an ESM `main`); an integration test running the dev server against the fixture and requesting the consumer module (rewritten import → `/@fs/…/src/index.ts`) and the library's loc module.

Risks:
- React hooks in components of libraries loaded as SPFx components (app catalog, or a future A/library mode): **broken by design** with a dev React. Document; the RequireJS `map` bridge needs research.
- Dev/prod differences of B (instance per graph, no version resolution, cross-solution singletons): document in `research/migration.md`.
- Library deps resolve from the library's own `node_modules` (only React is deduped): duplicate copies of shared packages, as in prod where the library bundles its own copies.
- Different tsconfig options in library and consumer (decorators, class fields).

Verify live after implementing: the generator pair (class + hooks component + SCSS + loc) as above; library with tsconfig `paths` and `require('./x.png')`; library depending on a second linked library; pnpm workspace and npm `file:`; two bundles in the consumer sharing library state; a library runtime error reaching the terminal and the overlay; a registry-installed SPFx library deployed in the app catalog (needs a library already deployed in the tenant: not done here, installing apps was out of scope).

## Verification status

| Claim | How |
|---|---|
| classic workflow (isLibraryComponent, port 4320, writeToDisk, static `dist` of linked packages) | code at `ee3b60b^` + guide |
| classic live reload on library change | inferred (webpack-dev-server `static` watch default) |
| heft: library manifest/externals in consumer, `manifests.js` with `node_modules/corp-lib/dist/` base URL | hands-on (`/tmp/libc`) |
| heft start writes to disk; one `debugManifestsFile` | code (`updateServeConfigAsync.js`, sp-loader dist) |
| today's fast-serve fails on a linked library (export names) | live |
| A0: library from `dist` → hooks fail (#321), React instances differ | live |
| B: render, loc, SCSS tokens, hot update, Fast Refresh with state, loc reload | live |
| B edge cases (nested libraries, `paths`, `require()`, error forwarding, pnpm) | inferred from code |
| app catalog libraries | not tested (nothing installed) |

The prototype script (not committed) is `/tmp/libc/experiment/serve-with-library.mjs <consumer> <port> [source|dist]`: it wires the installed fast-serve modules (`lib/plugins.js`, `localization`, `externals/facade.js`, `manifests`) with the two experiment plugins described in §4.
