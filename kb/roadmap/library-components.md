---
title: Library components
type: roadmap
status: current
tags:
  - project-kb
  - roadmap
  - library-components
  - react
  - hmr
---

# Library components

## Summary

Library components are not supported yet; research is done and the design waits for the user's agreement. Recommended: **option B**, one `fast-serve` command in the consumer that detects linked local SPFx library projects and serves their source inside the consumer's module graph, with Fast Refresh across projects and zero config (effort M). The heft/classic approach of loading the library as a separate SPFx component fails under `fast-serve` for hook components. A small prerequisite fix (export names of an ES-module `main`) is needed either way.

## Current Knowledge

### How heft and the classic tool do it

- Classic spfx-fast-serve: two projects, each with its own dev server. The library sets `"isLibraryComponent": true` and a unique port (default 4320) and only acts as a watch compiler writing `dist/` to disk; the consumer (linked with `npm install ../library`) is started second and serves the library's `dist/` at the URL SPFx put in the consumer's debug manifest. Start order matters; no HMR across projects.
- SPFx 1.24 with heft: the consumer imports the library as an external (`type: "component"` with the library id and version in its manifest); the consumer's `manifests.js` contains the library manifest with a base URL under `node_modules/<library>/dist/`, served through the symlink. The library must be built or watched (`heft build --watch`, or `heft start`, which writes to disk). Again one server and one debug manifest for the page plus a watcher in the library.
- sp-loader reads a single `debugManifestsFile` (a `localhost` URL), so a second server can only be reached by chaining from the first `manifests.js` (an idea, not tried).
- In production the library `.sppkg` is deployed tenant-wide; consumers resolve it at runtime (same major, at least the requested version, a debug manifest wins), and updating the library updates all consumers without rebuilding them.
- The generator's library project has no `main` in `package.json`; Microsoft's tutorial says to add `"main": "lib/index.js"`.

### Why the heft/classic approach fails under fast-serve

- `fast-serve` renders with the project's development React (see [Development React from the project](../decisions/development-react.md)). A library loaded as an SPFx component from its `dist/` gets the tenant's production React, so any hook in a library component fails with React error #321 "Invalid hook call". Verified live with a prototype that listed the library's `dist/` manifest; class exports worked, the hook component crashed.
- The same applies to libraries loaded from the app catalog (inferred; none was deployed for testing). A possible bridge (a RequireJS `map` giving the library the dev React) would need a hook into the SharePoint loader's configuration and is considered fragile; not tried.
- A second `fast-serve` in the library would add a second HMR client and refresh runtime, port and order handling and manifest chaining, and still needs one shared React; at best a library edit would reload the page.

### Prerequisite fix (S, needed anyway)

- Today a linked library breaks the consumer ("does not provide an export named …"): the externals component reads ES-module export names only from `module`/`exports.import`, but an SPFx library's `main` is ES module code that throws when evaluated as a script. Fix: if the `main` entry parses as ESM with exports, use those names. This also matters for third-party SPFx libraries installed from npm and deployed to the app catalog.
- Without a built `dist/`, a linked library isn't detected as a library at all and its `lib/` is bundled (or resolution fails): behavior currently depends on build state.

### Options compared

| | A: library as SPFx component | **B: library source in the consumer graph** | C: workspace mode |
|---|---|---|---|
| Commands | 2 | **1** | 1 at the repo root |
| Config | ports, start order, manifest chaining | **none** (auto-detected) | workspace option or root detection |
| React | broken for hooks unless bridged | one dev React (deduped), works | one dev React |
| HMR | library edit reloads at best | **Fast Refresh across projects** | as B |
| Production fidelity | high (own component, version, one instance per page) | lower (library is a module of the consumer) | as B |
| Library alone | yes | no (needs a consumer) | if a consumer is in the workspace |
| Effort | L | **M** | L |

### Option B design (recommended)

- Detection: dependencies whose real path is outside `node_modules` and whose `config/config.json` has a `Library` component, recursively for libraries of libraries. Works with `npm link`, npm `file:`, pnpm `link:`/`workspace:`, yarn/npm workspaces and Rush. pnpm and yarn classic `file:` copy the folder into `node_modules`, so they aren't detected; registry-installed libraries keep today's facade path through the app catalog.
- Resolution: the package name and `<package>/lib/*` resolve to the library's `src` files before the externals facade; the library root is allowed for serving and excluded from pre-bundling; the library's `lib/`, `dist/` and `temp/` are watch-ignored.
- Each library gets its own project model: its `localizedResources` merged with the consumer's (warn on a name clash), its tsconfig `paths` by importer location, its `config.json` externals merged into the debug manifest. The library root counts as project code for `require()` rewriting, `const enum` and type-only checks and terminal error forwarding. Transform options are global per server, so a warning is printed when the library's tsconfig options differ.
- The ready banner lists libraries served from source; `fast-serve` inside a library-only project prints a clear message to run it in a consumer (a library mode is phase 2).
- An opt-out (`"librarySource": false` per package) is a possible later escape hatch, not needed for v1.

### Prototype results (live, nothing saved)

- Render with the library's loc strings, `sp-*` facades and theme tokens in library CSS.
- Library class edit → hot update (bubbles to the consumer's Fast Refresh boundary); library React component edit → Fast Refresh with state kept; library SCSS edit → hot swap; library loc edit → page reload (as for the consumer's own loc). No library build needed.

### Dev vs production differences of option B (to document)

- One library instance per `fast-serve` graph, shared by all bundles of the consumer (as in production); a different solution on the same page that uses the deployed library gets its own app-catalog copy, so singletons and shared state aren't shared in dev.
- No version resolution: dev always runs the local source, whatever is deployed.
- The library's dependencies resolve from its own `node_modules` (only React is deduped), so shared packages can exist twice, as in production where the library bundles its own copies.
- The editor still reads the library's types from its built `lib/*.d.ts`: new exports need a library build or `tsc -w` for the IDE, not for `fast-serve`.

### Untested areas (verify live after implementing)

- Library with tsconfig `paths` and `require('./x.png')`; a library depending on a second linked library; pnpm workspace and npm `file:`; two consumer bundles sharing library state; a library runtime error reaching the terminal and the overlay; a registry-installed library deployed in the app catalog (requires a deployed library on the tenant).

### Later ideas

- Workspace mode: one server and one `manifests.js` for components of several SPFx projects; option B is its first step.
- Manifest chaining: one `debugManifestsFile` that depends on other servers' `manifests.js`; enables two servers with one URL but doesn't fix React.
- Library mode (`fast-serve` inside the library) so deployed consumers on the page pick up the dev library; needs facades to the tenant React (no Fast Refresh, reload on edit). Only if users ask.

## Links

- [Unsupported scope](../limitations/unsupported-scope.md)
- [SPFx component types](../concepts/spfx-component-types.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [SPFx library imports and config.json externals](../features/library-imports-and-externals.md)
- [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md)
- [Dev vs production differences](../limitations/dev-vs-production.md)
- [Roadmap overview](overview.md)

## Evidence

- Source: library components research (classic spfx-fast-serve code and guide, Microsoft Learn library tutorial, SPFx 1.24 heft manifest processing and sp-loader behavior, two generated 1.24 projects, a prototype checked live on the test tenant's hosted workbench)
- Confidence: high for live-verified items; classic live reload, B edge cases and app-catalog behavior inferred (medium); effort is an estimate
- Last checked: 2026-11-18
