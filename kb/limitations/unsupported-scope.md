---
title: Unsupported scope
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - library-components
  - versioning
  - extensions
  - react
---

# Unsupported scope

## Summary

`fast-serve` 1.24.x serves web parts, extensions and ACEs of SPFx 1.24.x projects on `localhost`, in SharePoint pages. Library components, other SPFx minors, localized command titles, tunnels/containers/WSL and Teams hosts are out of scope today. Library components carry an extra problem: SPFx libraries loaded as separate components break when they render hooks, because the page then mixes the dev React with the tenant's React.

## Current Knowledge

### Library components (severity: high for library-based solutions)

- Components of type `Library` in the project are skipped with a warning; a project with only libraries fails with `No web parts, extensions or Adaptive Card Extensions found`.
- **Hook components from SPFx libraries loaded as components** (from the app catalog, or the heft/classic way from a library's `dist/`) fail with React error #321 "Invalid hook call": the library uses the tenant's production React while the consumer renders with the project's development React. Verified live with a library built from `dist/`; inferred for app-catalog libraries (none was deployed for testing). Class exports and non-React code work.
- **A linked (local) SPFx library breaks the consumer today**: the export names of the library's ES-module `main` aren't read, so the page fails with "does not provide an export named …". If the library was never built, it isn't recognized as a library and its `lib/` is bundled (or resolution fails): behavior depends on build state.
- **Linked library styles**: library `.module.scss.css` loaded outside pre-bundling goes through the themed-styles loader, which can't remove styles, so each edit adds a second `<style>` and leaves stale rules (the new rules still apply). Irrelevant for packages in `node_modules`, which don't change.
- Planned direction: serve local libraries from source in the consumer's graph (see the roadmap category).

### SPFx versions (severity: blocking, by design)

- Only SPFx 1.24.x (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`); the installed `major.minor` is checked at start and a mismatch exits with `Unsupported SPFx version`.
- SPFx 1.22 and 1.23 are not supported: upgrade first. SPFx ≤ 1.21 uses the classic spfx-fast-serve. 1.23 support was researched but not decided (see [Version policy](../decisions/version-policy.md)).

### Extensions and manifests

- A localized command title in a Command Set manifest (`"title": { "id": "$…" }`) isn't resolved (heft fills it from the loc file). Use `"default"` texts. Severity: low.
- Icon paths: relative `./` icon paths are served from `src`; `"icons/x.png"` without `./` is passed through as heft does and resolves against the dev server root.

### Hosts and environments

- `localhost` only: no tunnels (ngrok), containers, Docker/WSL-specific setup, or Teams hosts. Remote development works only by forwarding the port so the browser still reaches `https://localhost:<port>` (see [Environment and browser gotchas](environment-and-browser-gotchas.md)).
- The SharePoint Online hosted workbench, still the generator's `initialPage` and handy for ACEs, is retired on 2026-12-01; use a SharePoint page afterwards.
- Not provided on purpose: production builds, type checking, linting, a CORS/allowed-origins option, logging levels, a `debug` flag (see [Dev server only](../decisions/dev-server-only.md) and [Zero-config CLI](../decisions/zero-config-cli.md)).

## Links

- [SPFx component types](../concepts/spfx-component-types.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Development React from the project for Fast Refresh](../decisions/development-react.md)
- [Styles, theme tokens and asset typings](../features/styles-and-assets.md)
- [Serving web parts, extensions and ACEs](../features/serving-components.md)
- [Dev vs production differences](dev-vs-production.md)

## Evidence

- Source: user docs (requirements, limitations, troubleshooting), library-components research (live prototype on the test tenant), library CSS research, project handoff notes, implementation behavior (project model, version check)
- Confidence: high; app-catalog library behavior is inferred (medium)
- Last checked: 2026-11-18
