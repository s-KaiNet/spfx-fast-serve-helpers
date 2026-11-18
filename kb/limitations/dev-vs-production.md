---
title: Dev vs production differences
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - production-parity
  - react
  - externals
  - performance
---

# Dev vs production differences

## Summary

`fast-serve` runs the same source as `heft build`, but the page executes it differently: one unbundled native ES module graph instead of per-bundle webpack bundles, a development React from the project instead of the tenant's production React, one shared external list, and no type checking. Code that relies on bundle isolation, the exact React instance or build-time checks can behave differently in dev. Cold page loads of very large projects are slower than `heft start`. Every change must still be verified with `heft build` / `heft package-solution`.

## Current Knowledge

| Area | Production / `heft start` | `fast-serve` | Impact | Workaround |
|---|---|---|---|---|
| Module instances | each `config.json` bundle has its own copy of shared modules | one ES module graph for the whole page: all bundles (web parts, extensions, ACEs) share one instance of every module | medium: module-level state (caches, singletons, PnPjs setup) is shared between bundles in dev only, so cross-bundle bugs can hide or appear | don't rely on modules being shared or isolated; keep state in component instances or `onInit` results |
| React | the production React the page ships (tenant version) | development React/react-dom from the project's `node_modules`, deduplicated to one copy | low for project code (dev warnings and React DevTools work, slower renders); high for SPFx library components that render hooks (see [Unsupported scope](unsupported-scope.md)) | none needed for project code |
| SPFx libraries (`@microsoft/sp-*`) | webpack externals resolved by the loader | loaded on demand from the page: same instances and the tenant's version, as in production | none | — |
| `config.json` externals | each manifest lists the externals its bundle uses | every external is listed in every component's debug manifest (one shared RequireJS `require`) | low: an external loads even for a component that doesn't use it; a broken external surfaces in dev for every component | — |
| Build output | `lib/`, `dist/`, `temp/` | only typings in `temp/sass-ts` and `temp/static-asset-ts` | none for the page; production artifacts must come from Heft | run `heft build` before shipping |
| Checks | type checking and lint in the build | none: each file is compiled on its own without type information | medium: type errors don't stop the dev page | run `tsc --noEmit`, ESLint or `heft build` separately |
| Loc files | copied as is to `dist/` | evaluated or bundled, so ES-module loc files work in dev | medium: an `export default` / `export =` loc file works in dev but breaks or fails in production | write `define([], function () { return { … }; });` (`fast-serve` warns) |
| SPFx version | tenant version | tenant version; a project newer than the tenant gets a clear error | same failure as production | use the SPFx version the tenant supports |

### Page-load performance on very large projects

- Every source module is a separate request from the SharePoint page to `localhost`. With ~1000 generated modules a cold page load took 8.5 s against 3.3 s for `heft start` (about 1180 requests against 6); SharePoint itself is ~1.1–1.4 s of every load.
- The bottleneck is the browser fetching and evaluating modules, not server transforms.
- Nothing is compiled ahead of the page (no startup warmup), so the first load after a start is the slowest one.
- Server start (well under 2 s vs ~22 s) and edit-to-DOM (tens of ms vs ~4–5 s rebuild and reload) are far faster, so the trade-off is intentional: rely on HMR rather than F5. Vite's bundled dev mode was rejected (see [Unbundled dev server without startup warmup](../decisions/unbundled-dev-without-warmup.md)).
- Severity: low for typical projects, noticeable for projects with many hundreds of modules on the page. Measured numbers, including the package's current load times, are in [Benchmark results and performance conclusions](../references/benchmark-results.md).

## Links

- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [Development React from the project for Fast Refresh](../decisions/development-react.md)
- [Dev server only; Heft keeps builds, checks and packaging](../decisions/dev-server-only.md)
- [SPFx library imports and config.json externals](../features/library-imports-and-externals.md)
- [Localized strings](../features/localization.md)
- [HMR gotchas](hmr-gotchas.md)
- [Benchmark results and performance conclusions](../references/benchmark-results.md)

## Evidence

- Source: user docs (migration "what's different", limitations), project handoff notes (performance, heft facts), proof-of-concept benchmark research, implementation behavior (manifests and externals components)
- Confidence: high (behavior); medium (performance numbers are PoC-era or partial package runs)
- Last checked: 2026-11-18
