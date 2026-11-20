# Library components in the Rspack version: which developer experience?

Date: 2026-11-20. Decision note, no implementation. Sources: the Vite research [../library-components/README.md](../library-components/README.md) (heft and classic behaviour verified hands-on there, plus a live prototype of option B on Vite); the Rspack branch code at `1.24.0-rspack.14` (`project/libraries.ts`, `externals/`, `react/`, `hmr/`, `typescript/`, `styles/`, `localization/`, `rspack/config.ts`); the `react-refresh` 0.19 runtime source. **Nothing new was built or checked live for this note.** On scope: the user asked for a short comparison and no prototype unless a question can't be settled from code. The one open question (React in the split setup) was settled by reading the source.

## Current state on the Rspack branch

`findSpfxLibraries` treats every installed package that has `dist/*.manifest.json` as an SPFx library, and so as an AMD external loaded by id from SharePoint. A linked library project that has been built becomes an external. The page then loads the version deployed to the tenant, or fails if none is deployed, so local edits never appear. If the linked library was never built, it gets bundled from `main` (`lib/`), and its loc module (`CorporateLibraryLibraryStrings`) doesn't resolve. Either way, local libraries don't work today.

## How heft and classic do it (from the Vite research, verified there)

- The library is a normal SPFx project. The manifest has `componentType: "Library"` and `version: "*"`, and the bundle is `define("<id>_<version>", [...])`.
- In the consumer, `import 'corp-lib'` becomes an AMD dependency `corp-lib`. The manifest maps it to `{ type: "component", id, version }`.
- At runtime SharePoint resolves the library by id, and a debug manifest wins over the deployed one.
- **heft**: the consumer's `manifests.js` lists the library's manifest with base URL `https://localhost:4321/node_modules/corp-lib/dist/`. The library must be built (`heft build --watch` or `heft start` in the library, which writes to disk). That means one server plus a watcher.
- **Classic fast-serve**: `isLibraryComponent: true` plus its own port. The library's instance only writes `dist/` to disk, and the consumer serves the library's `dist/` statically. Two terminals with a fixed start order. A library edit means a reload, with no HMR across projects.
- The page can only use one `debugManifestsFile`.

## The options, by developer experience

### (a) One command in the consumer, local libraries detected and compiled from source

`fast-serve` in the consumer finds dependencies that are local SPFx library projects. Such a package's real path is outside `node_modules`, and its `config/config.json` has a `"Library"` component. The consumer:
- stops externalising those packages;
- resolves `corp-lib` to `src/index.ts`, and `corp-lib/lib/x` to `src/x`;
- compiles that source as part of its own bundles.

The page never loads the library as an SPFx component. In Rspack, much of this works without changes, judging from the code:
- `resolve.symlinks` defaults to true, so library files get their real paths outside `node_modules`. The SWC rule (`exclude: node_modules`) then applies to them.
- The watch-ignore pattern only covers the consumer's own `lib/dist/temp` and `node_modules`, so files outside the root are watched.
- The `react$` alias is global, so the library's `react` imports resolve to the consumer's dev React.
- `sp-*` imports are externals by request name, wherever the importing file lives.

What has to be added:

| Area | Change |
|---|---|
| `project/` | detect local libraries, following library dependencies recursively, and remove them from `libraries()`. Give each one a small model: loc, tsconfig `paths`, `config.json` externals, ambient const enums. Add their `package.json`, `config.json` and tsconfig to `modelFiles()` and restart triggers, and so to the cache fingerprint |
| resolve | alias each package and its `lib/*` paths to `src` |
| `hmr/` | add the library `src` folders to `ReactRefreshRspackPlugin` `include`; today only the consumer's `src` is included, so library components would not Fast Refresh |
| `localization/` | add aliases for the libraries' `localizedResources`, and warn on name clashes |
| `typescript/` | add a tsconfig `paths` rule per library (`include: <library root>`, its own `tsConfig`). Run the const-enum and type-only checks for library roots too. Warn when the library's class/decorator options differ from the consumer's (the SWC options are global) |
| `externals/`, `manifests/` | merge in the library's `config.json` externals. Treat library roots as "project code" for the deep-import warning and for error frames |
| `server/`, setup | print "libraries from source: corp-lib (../corp-lib)". In a library-only project, show a clear message |
| `config/` | opt-out per package (e.g. `"libraries": { "corp-lib": "deployed" }`) for false positives |

On Vite the same approach was verified live: render, loc, SCSS with theme tokens, library TS hot update, Fast Refresh of a library hooks component with state kept, and a reload on loc edits. In Rspack the HMR path is the same bundle runtime the consumer already uses, so the same results are expected. Not verified on Rspack.

### (b) Classic split: fast-serve in the library (library mode, own port) plus fast-serve in the consumer

The library's fast-serve serves an AMD bundle and a `Library` debug manifest. The consumer keeps `corp-lib` as an external by id, and the page has to see both manifests. Two pieces are needed:
- **Manifest chaining**: there is only one `debugManifestsFile`, so the consumer's `manifests.js` has to load the library's (an AMD dependency on `https://localhost:<libPort>/temp/build/manifests.js`), or the consumer fetches it.
- **React (the deciding issue).** Classic fast-serve got away with two separate builds because both used SPFx's externals, so the library and the consumer shared the page's React. The Rspack version bundles a dev React copy into each bundle so Fast Refresh works. A library bundle with its own React, or with the tenant's React, plus a consumer with its dev React means hooks in library components crash. The Vite research saw exactly this live (React error #321). Both bundles have to use **one** dev React, and that React has to be a separate AMD module: RequireJS runs the library before the consumer bundle, so the consumer can't hand its React over.
- **Sharing React alone isn't enough.** From the `react-refresh` runtime source: each runtime calls `helpers.setRefreshHandler(resolveFamily)` on the shared renderer when it refreshes, and the last one to refresh wins. The consumer keeps rendering the library component type it imported originally, and only the library's runtime can map that type to the edited version. So after a consumer edit, library components fall back to their original code. **The refresh runtime has to be shared too**, so both bundles need `react`, `react-dom` and `react-refresh/runtime` as externals pointing to a shared module that one of the two servers serves. This cross-process convention (which server serves it, version match, start order) is the expensive part.
- **What remains**: library mode in the project model (`Library` component, `id_version` define, its manifest), two ports and a start order, two HMR clients. Library HMR itself is fine, since each bundle has its own client.
- **Idea, not verified**: the consumer's debug manifest registers a dev React under the tenant React's component id. A debug manifest wins, so every component on the page, SharePoint's own included, would get the dev React. That avoids the port coupling but changes React for the whole page, unlike heft.
- **Cheaper variant without Fast Refresh in the library**: it still needs the shared dev React, so the cost barely drops.

### (c) Workspace mode

`fast-serve` at a monorepo root (or `--with ../lib`) serves the bundles of several SPFx projects from one server and one `manifests.js`. This is (a) plus multi-project entries and manifests: a project model per project in every feature. **L.** It only pays off with several solutions per repo. Later, and (a) is its first step.

## Comparison

| | **(a) one command, source in consumer** | (b) split, two fast-serves | (c) workspace |
|---|---|---|---|
| Terminals and config | **1, none** (opt-out for false positives) | 2, library port, start order | 1, root/option |
| Build state needed | none (`src` is compiled; the IDE still uses `lib/*.d.ts`) | none (library server compiles) | none |
| React hooks | work: one dev React via the global alias | only with a shared dev React **and** shared refresh runtime across processes | like (a) |
| Library edit | Fast Refresh with state (verified on Vite; expected on Rspack) | Fast Refresh only with the shared runtime, otherwise reload | like (a) |
| Production fidelity | lower: library is consumer code; **one instance per consumer bundle** (Rspack bundles don't share modules), not per page; no version resolution | high: separate component by id, one instance per page, real `loadComponentById` | like (a) |
| `loadComponentById(libId)` at runtime | gets the deployed copy (another instance) or fails | gets the dev library | like (a) |
| Library alone on a page with deployed consumers | no | yes | no |
| Effort | **M (3–4 days)** | **L (6–8 days)** + fragile shared-React contract | L (8+ days) |

## Risks of (a)

- **Detection false negatives**: pnpm `file:` and yarn classic `file:` copy the folder into `node_modules`, so the package isn't recognised and stays an external. Document `npm link`, npm `file:`, pnpm `link:`/`workspace:` and yarn/npm workspaces.
- **Detection false positives**: a symlinked library the user wants loaded as deployed. Covered by the opt-out.
- **Library settings differ from the consumer's**:
  - SWC class/decorator options are global: warn, don't support both.
  - The library's `sass.json` is ignored: class names are hashed from the source path, not heft's `lib/` path. Unique, but they differ from heft's (cosmetic).
  - Library dependencies other than React resolve from the library's own `node_modules`, so packages can be duplicated (like production, where the library bundles its own).
- **Watching outside the root**: works by default (only resolved files are watched). The library's `lib/` isn't resolved after the `src` alias.
- **Runtime instances**:
  - Library singletons and `instanceof` are per consumer bundle.
  - A second solution on the same page uses the deployed library, so two instances.
  - Code that calls `SPComponentLoader.loadComponentById(<library id>)` gets a different copy.
  - All of this goes into the docs. If users need it, listing a debug manifest for the library is a later add-on and runs into the (b) React problem.
- **Several consumers on one page**: two servers but one `debugManifestsFile`. That limitation exists today; (c) would solve it.
- **Maintenance**: "project root" becomes "project roots" in about six features (refresh include, paths rule, const enums, type-only check, deep-import warning, error frames). That is a contained list, and each feature already takes a root. No new runtime code, and no cross-process protocol.

## Recommendation

**(a)**, zero-config with a per-package opt-out. It is the most convenient (one command, no build state, Fast Refresh across projects). It is not too hard: Rspack already does resolution, watching and React dedupe for it, and the work is mostly extending the existing per-root features. The classic split is **not** simpler on this branch. Classic only worked because both builds shared SPFx's externalised React. Ours bundles dev React for Fast Refresh, so a split needs a shared React and refresh-runtime module between two processes, plus manifest chaining, ports and start order. (b) is worth doing only if users need the library loaded by id, or tested against deployed consumers. (c) comes later, on top of (a).

## Proposed PLAN.md tasks (not added)

| Task | Content | Acceptance |
|---|---|---|
| L1 Local library detection (S, 0.5 d) | `project/localLibraries`: real path outside `node_modules` plus a `Library` component, recursive. Remove from `libraries()`. Library models (loc, `paths`, externals). Model files and restart triggers. Opt-out option | unit tests with a symlinked fixture library (nested, registry library still external, opt-out) |
| L2 Source resolution, loc, HMR (M, 1.5 d) | aliases to `src`, refresh `include`, loc aliases, library `config.json` externals in manifests, startup line, library-only message | integration compile: consumer imports a library class, a hooks component, SCSS and loc; no `corp-lib` external; dev-server HMR test across roots |
| L3 Per-root TypeScript features (S, 1 d) | `paths` rule per library, const enums, type-only check, deep-import warning, error frames for library roots; warning on differing class options | integration tests |
| L4 Live acceptance and docs (S, 0.5–1 d) | generator pair (library with class, hooks component, SCSS, loc) via npm `file:` and pnpm `link:`: render, TSX Fast Refresh with state, SCSS swap, loc reload, consumer edit; two consumer bundles; README limitations (instances, `loadComponentById`, pnpm `file:`) | live table in the KB acceptance page |

## Verification status

| Claim | Basis |
|---|---|
| heft/classic mechanics, single `debugManifestsFile` | Vite research (hands-on heft 1.24.1, classic code) |
| a split with differing React breaks hooks (#321) | live on Vite, in the Vite research |
| (a) works with Fast Refresh across projects | live on Vite; Rspack expected from code, **not verified** |
| two refresh runtimes on one renderer: last `setRefreshHandler` wins | `react-refresh` 0.19 source, **not run** |
| Rspack points (symlinks, watch, global React alias, refresh `include` limited to `src`) | branch code |
| current branch misbehaviour with a linked library | branch code (`findSpfxLibraries`), not run |
| effort estimates | judgement |
