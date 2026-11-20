---
title: Local library component projects
type: feature
status: current
tags:
  - project-kb
  - library-components
  - spfx-libraries
  - hmr
---

# Local library component projects

## Summary

A library component project (`componentType: "Library"`) linked into a consumer project is compiled from its `src` into the consumer's bundles. One `fast-serve` in the consumer, zero config, no library build; library files follow the same HMR rules as project files (components Fast Refresh with state kept, styles hot-swap, loc edits hot-update or reload depending on who imports them), library configuration edits restart `fast-serve`. A library installed from a registry stays an SPFx library external loaded from SharePoint. `deployedLibraries` in `fast-serve/config.json` opts a linked library out.

## Behavior

### Detection

- The project model walks dependencies transitively (also the dependencies of linked libraries, resolved from the library's own folder). A package is a **local library** when its real path has no `node_modules` segment and its `config/config.json` has a component whose manifest says `componentType: "Library"`. That covers `npm link`, npm `file:` (a symlink), pnpm `link:`/`workspace:` and npm/yarn workspaces.
- A local library is removed from the SPFx library externals even when it has been built (has `dist/*.manifest.json`). Registry installs and copies in `node_modules` (pnpm and yarn classic `file:`) keep the external path.
- `"deployedLibraries": ["<package>"]` (strings only, in `fast-serve/config.json`) keeps that package an external; when it has no built `dist` manifest, its id and version come from the library's source manifest (`version: "*"` → `package.json` version). A listed name that is no SPFx library dependency prints a warning.
- Each local library gets a small model of its own (the project model run on the library root, in library mode): loc resources, tsconfig chain with `paths`/`baseUrl` and class options, `config.json` externals. Its warnings are prefixed with the package name. When the library entry (`./lib/index.js` of the Library component) has no source under `src/`, a warning says so and the package is bundled from its `main` like any dependency.
- The startup summary lists `SPFx libraries from source: <package> (<path relative to the project>)`.
- `fast-serve` in a library project stops with "<name> is an SPFx library project: run fast-serve in a consumer project that depends on it …". A project with web parts **and** a Library component serves the web parts and warns that its library component is not served.

### Compilation

- Aliases: `<package>` → the library entry's source (`src/index.ts`), `<package>/lib` prefix → the library's `src` folder. `resolve.symlinks` keeps real paths, so library files are outside `node_modules` for every rule: SWC, CSS, the refresh loader include (the library `src` folders are added to it).
- The library's React imports resolve to the project's development React through the global React alias; `sp-*` imports stay externals by request name.
- Library `localizedResources` are aliased like the project's; on a name clash the project's (or the first library's) strings win with a warning.
- Library `config.json` externals merge into the project's externals (the project wins on a name clash), so the debug manifest lists them for the bundles that import them.
- TypeScript features run per code root (project and each library): tsconfig `paths` rule with the library's own tsconfig, `const enum` check for ambient enums from the library's `src/**/*.d.ts` and for declaration-only imports, the type-only re-export warning filter. Messages name library files relative to the project (`../corp-lib/src/…`).
- SWC class options are global (the project's). A library whose `experimentalDecorators`, `emitDecoratorMetadata` or `useDefineForClassFields` differ prints a warning naming the differences.
- Library code counts as project code for the deep SPFx library import warning, compile problem locations, rebuild lines (`rebuilt in 50 ms (../corp-lib/src/…)`) and browser runtime errors (frames from library sources are project frames, mapped and shown with a code frame and overlay).
- Library model files (`package.json`, `config/config.json`, the Library manifest, tsconfig chain, local-file externals) are restart triggers and part of the persistent-cache fingerprint; library source files are watched by Rspack like project files (only resolved files, so the library's `lib/` is not watched).

### Runtime consequences

- The library is consumer code: one instance per bundle (Rspack bundles don't share modules), not per page; other solutions on the page use the deployed library; `SPComponentLoader.loadComponentById(<library id>)` returns the deployed copy or fails.
- The library's `config/sass.json` is ignored; its class names hash the source path, unique but different from the library's own heft build.
- Other library dependencies resolve from the library's `node_modules`, so a package used by both can be bundled twice (as in production, where the library bundles its own).
- With the opt-out and no deployed library on the tenant, the bundle declares the library as a `component` resource that the tenant cannot resolve; SharePoint shows "Something went wrong" for the web parts of that bundle.

## Decisions

- One command with library source in the consumer was chosen over a split setup (library-mode fast-serve plus consumer fast-serve, manifest chaining): this line bundles a development React per bundle for Fast Refresh, so a split would need a shared React and a shared refresh runtime across two processes. A workspace mode serving several solutions builds on this later.
- `deployedLibraries` lives only in `fast-serve/config.json` (no CLI flag); it is the per-package escape hatch for false positives.

## Links

- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [Project model](../architecture/project-model.md)
- [HMR and React Fast Refresh](hmr.md)
- [TypeScript and tsconfig](typescript-and-tsconfig.md)
- [Restarts on project changes](project-restarts.md)
- [Errors, overlay and terminal output](errors-and-diagnostics.md)
- [SPFx component types](../concepts/spfx-component-types.md)
- [Acceptance run on the test projects](../operations/acceptance-run.md)

## Evidence

- Source: implementation behavior. Unit tests with a symlinked library fixture: detection, built library kept local, nested library through a library's own `node_modules`, registry library stays external, opt-out with the source manifest id, missing entry source, model files and invalidation, merged externals, library-only message, startup line, `deployedLibraries` parsing and warning, deep-import paths and browser-error frames for library roots, rebuild/problem paths. Integration compile: library class with loc strings and tsconfig `paths`, React component with CSS module class names, `config.json` external declared on the bundle, no library AMD dependency, refresh registration in library modules, const enum message with project-relative library paths, class-option warning, type-only re-export warning hidden (shown when the filter is limited to the project root), opt-out bundle declaring the library. Dev-server integration with a fake page: library component hot update, library style swap, project component update, reload on a library loc edit that reaches the web part class, library external in the debug manifest, quiet console.
- Live (2026-11-20, `1.24.0-rspack.15`, SharePoint Online, consumer = spfx-rea copy, library generated by `@microsoft/generator-sharepoint` 1.24.1 with a class, a hooks component, SCSS and loc strings, linked with npm `file:`): see the table in the [acceptance page](../operations/acceptance-run.md).
- Not verified live: pnpm `link:`/`workspace:` (same symlink shape as npm `file:`), a library imported by two bundles on one page, a library depending on another local library.
- Confidence: high
- Last checked: 2026-11-20
