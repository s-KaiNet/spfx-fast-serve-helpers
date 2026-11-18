---
title: SPFx libraries and externals at runtime
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - externals
  - top-level-await
  - pre-bundling
  - sp-loader
---

# SPFx libraries and externals at runtime

## Summary

`@microsoft/sp-*` packages, other SPFx library components found in `node_modules` and `config/config.json` `externals` are never served from `node_modules`: the browser always gets the instances the SharePoint page loads, in the tenant's version, exactly as in production. `fast-serve` replaces each such import with a small **facade** module that loads the library on demand through SharePoint's loader. ES-module importers get a top-level-await facade; `require()` importers inside pre-bundled dependencies get a synchronous facade backed by one parallel preload per chunk. The same facades run in Vite's normal pipeline and in dependency pre-bundling, so project code and third-party packages share one instance per library.

## Current Knowledge

### What counts as an SPFx library

- The project model walks the project's dependencies (and their dependencies) and treats any package that ships a single SPFx library manifest in its `dist/` folder as an SPFx library, like SPFx's own externals scan. It records the package name, component id, version and package folder. The project's own package is excluded.
- For each library the externals component reads the export names from the package's ES entry (`module` or `exports["."].import`), following `export *`; if none are found it evaluates the script entry in a sandbox with a timeout. This is needed because `@microsoft/sp-lodash-subset` ships an AMD blob in its "ESM" folder. If export names can't be read, only the default export is available and a warning is printed.
- `config.json` `externals` (URLs or local files, optionally with `globalName` / `globalDependencies`) are validated like heft. An external with the same name as an SPFx library is ignored with a warning: the SPFx library wins.

### What the debug manifest lists

- `scriptResources` holds the bundle shim, `@microsoft/sp-loader` as a `component` resource (so the shim's scoped `require` can reach `SPComponentLoader`) and every `config.json` external as `type: "path"` (URLs as is, local files as absolute dev server URLs under `/@spfx/external/<name>.js`, plus `globalName` / `globalDependencies`). Every external is listed in every manifest, because all bundles share one RequireJS `require`.
- **No other SPFx library is listed.** Listing libraries makes sp-loader resolve them before running the shim (about 400 ms slower in measurements) and load every listed library eagerly, even unused ones.

### Library loader (browser)

- Installed by the bundle shim once per page; the first shim to run provides the component-scoped RequireJS `require`.
- SPFx libraries load with `SPComponentLoader.loadComponentById(id, version)` using the id and version from the package's manifest. The tenant resolves the request to its own same-major version (a project on 1.24.1 gets the tenant's 1.25.0); a request newer than the tenant fails, as in production, and the loader explains the mismatch. Libraries the page already loaded resolve in about 1 ms; libraries the page never loaded are fetched from the CDN when first imported.
- `config.json` externals load through the scoped RequireJS `require`, so the manifest's paths and shims (`globalName`, `globalDependencies`) apply as in heft.
- Each library or external is requested once and cached; loaded values are also kept in a synchronous registry for the CommonJS facades.

### Facades

- **ESM facade** (any `import` of a library or external, in project code or in pre-bundled ES modules): awaits the loader at the top level, then re-exports `default` and the known named exports. Native ESM evaluates sibling async modules in parallel, so several facades load concurrently. A module that imports a facade evaluates only after that library is loaded.
- **CommonJS facade** (`require()` calls inside pre-bundled dependencies): returns the already-loaded value synchronously. A plain top-level-await facade would make Rolldown fail with `REQUIRE_TLA` on CommonJS code.
- **Per-chunk preload**: after pre-bundling, every chunk that contains facades gets one `await` of a parallel preload of all libraries and externals it uses, prepended at the top. This guarantees the synchronous facades find their value and turns sequential awaits into one parallel wait (154 ms → 52 ms for three libraries in measurements).
- Facades only await RequireJS, which is outside the ESM graph, so they cannot create top-level-await deadlocks. Using a facade outside a page that loaded the bundle shim throws a clear error.
- Type-only imports (for example `IReadonlyTheme`) are erased and load nothing, as in production webpack builds.
- Consequences: dynamic `import('@microsoft/sp-…')` works; adding a new SPFx import during a session hot-updates instead of reloading; HMR does not re-evaluate facades; a failed facade stays failed until the page reloads; unrelated modules may evaluate before libraries they don't import.

### Why on-demand loading

On-demand facades were chosen over preloading the libraries in the shim: the component was ready about 300 ms sooner than with preloading, already-loaded libraries cost about 1 ms each, unused libraries are never fetched, and new SPFx imports no longer force a reload. The decision and its alternatives are recorded in [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md).

## Links

- [Architecture overview](overview.md)
- [Startup and request flows](runtime-flows.md)
- [Source pipeline](source-pipeline.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [SPFx library imports and config.json externals](../features/library-imports-and-externals.md)

## Evidence

- Source: top-level-await externals research (verified live on a SharePoint Online tenant serving SPFx 1.25.0 with a 1.24.1 project, and offline with Rolldown), project handoff notes, implementation behavior (externals and project model components, library loader runtime)
- Confidence: high
- Last checked: 2026-11-18
