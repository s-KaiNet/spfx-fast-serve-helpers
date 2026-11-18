---
title: On-demand SPFx library facades with top-level await
type: decision
status: current
tags:
  - project-kb
  - decision
  - externals
  - top-level-await
  - spfx-libraries
---

# On-demand SPFx library facades with top-level await

## Summary

SPFx libraries (`@microsoft/sp-*` and any package shipping an SPFx library manifest) are loaded from the SharePoint page on demand: each import resolves to a small facade module that awaits `SPComponentLoader.loadComponentById(id, version)` at the top level. This was chosen over preloading the libraries in the bundle shim or listing them all in the debug manifest.

## Context

SPFx libraries must come from the page, in the tenant's version, so project code and SharePoint share the same instances (`ServiceScope`, `pageContext`). Native ES modules need the library values before importing modules evaluate. Alternatives considered:

- list the used libraries in the manifest's `scriptResources` and preload them in the shim before importing the entry (the proof-of-concept flow);
- list every SPFx library in the manifest;
- resolve through the component-scoped RequireJS `require`.

Pre-bundled third-party dependencies (`@pnp/spfx-controls-react`, `@pnp/sp`) import SPFx libraries too; bundling a second copy breaks them silently.

## Decision

- ESM importers get a **top-level-await facade** that loads the library by id and version through `loadComponentById` and re-exports its named exports. `require()` importers inside pre-bundled dependencies get a synchronous facade plus one parallel preload per chunk (a plain top-level-await facade makes Rolldown fail with `REQUIRE_TLA`).
- The same facades run inside dependency pre-bundling, so dependencies share the page's instances.
- The debug manifest lists only `@microsoft/sp-loader` plus `config.json` externals, not the SPFx libraries.
- `config.json` externals use the same facade mechanism through the component's scoped RequireJS `require`.

## Rationale

- Measured live: the component was ready about 300 ms sooner than with shim preloading; listing libraries in the manifest made the loader resolve them before running the shim (about 400 ms); listing all libraries fetched unused ones on every load.
- Already-loaded libraries resolve in about 1 ms each; sibling facades evaluate in parallel; the per-chunk preload turned 154 ms of sequential awaits into 52 ms.
- Dynamic `import('@microsoft/sp-…')` works, and adding a new SPFx import during a session hot-updates instead of requiring a reload.
- The scoped `require` only knows names listed in `scriptResources`, and listing a library there makes SharePoint load it eagerly, so loading by id is the only on-demand path. Facades only await RequireJS, outside the ESM graph, so they cannot deadlock.
- Version semantics match production: a requested version resolves to the tenant's newer same-major version; a newer requested version fails.

## Consequences

- A failed facade stays failed until the page reloads (ES modules cache evaluation errors).
- Unrelated modules may evaluate before libraries they don't import; code relying on a library loaded as a side effect without importing it could break (rare).
- Third-party SPFx library components depend on their manifest being in the tenant (app catalog); library components served from source are planned separately.

## Links

- [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)
- [SPFx library imports and config.json externals](../features/library-imports-and-externals.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Development React from the project for Fast Refresh](development-react.md)

## Evidence

- Source: top-level-await externals research (live on the tenant and offline Rolldown cases), user decisions recorded in the project handoff notes, package performance runs
- Confidence: high
- Last checked: 2026-11-18
