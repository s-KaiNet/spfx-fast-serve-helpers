---
title: SPFx development loop and what fast-serve replaces
type: concept
status: current
tags:
  - project-kb
  - spfx
  - heft
  - vite
---

# SPFx development loop and what fast-serve replaces

## Summary

SPFx 1.22+ projects build with Heft. `heft start` is the classic development loop: it builds the project with webpack and serves the output from `https://localhost:4321` so a real SharePoint page can load it in debug mode. `fast-serve` replaces only that loop with a Vite dev server that serves source files as native ES modules with HMR and React Fast Refresh. Production builds and `.sppkg` packaging always stay on Heft.

## Current Knowledge

### The Heft toolchain

- An SPFx 1.24 project delegates all build configuration to the rig `@microsoft/spfx-web-build-rig` (selected in `config/rig.json`); `@microsoft/spfx-heft-plugins` generates the webpack configuration in memory from `config/config.json`. A local `webpack.config.js` is ignored; customization happens through `config/spfx-customize-webpack.js` or `config/webpack-patch.json`.
- `heft build` runs Sass (compiles `.module.scss` to CSS and writes typings to `temp/sass-ts`), static-asset typings (`temp/static-asset-ts`), TypeScript (`src` → `lib/` as ES modules targeting ES5, plus `lib-commonjs/` for Jest), lint, and finally webpack, which bundles `lib/` (not `src/`) into `dist/`.
- webpack emits one AMD bundle per `config/config.json` bundle, a component manifest per component, and `temp/build/manifests.js` (see [Component manifests and the SharePoint loader](component-manifests-and-loader.md)).
- `heft package-solution --production` zips the release manifests and assets into `sharepoint/solution/<name>.sppkg`. In production SharePoint serves the assets from the tenant's client-side assets library or a CDN.

### `heft start`

- `heft start` = Heft build in watch mode plus webpack-dev-server on `https://localhost:4321` (port and host from `config/serve.json`), using the Rushstack development certificate (see [SharePoint debug flow](sharepoint-debug-flow.md)).
- It serves the whole project root statically, so `/temp/build/manifests.js` and `/dist/*.js` are reachable; it sends `Access-Control-Allow-Origin: *` and `Access-Control-Allow-Private-Network: true`.
- It prints the page URL with the debug query (`initialPage` or a `serveConfigurations` page from `config/serve.json`, `--serve-config <name>` to pick one).
- Its HMR is effectively live reload: SPFx code never accepts webpack hot updates, so every edit is a rebuild (seconds) plus a full page reload.

### What `fast-serve` changes

- `fast-serve` is a zero-config CLI from `spfx-fast-serve-helpers` that runs Vite programmatically. There is no user `vite.config` and no webpack.
- Nothing is bundled up front: the browser loads each source file as a native ES module, transformed on request. Server start takes about a second or less; an edit reaches the page in tens of milliseconds as a hot update.
- It produces the same public contract SharePoint needs from `heft start`: `/temp/build/manifests.js` on `https://localhost:<port>`, component manifests and a classic AMD script per bundle. The AMD script is a small shim that hands over to the ES module graph.
- It writes only typings (`temp/sass-ts`, `temp/static-asset-ts`) so the IDE knows new style classes and assets; no `lib/`, `dist/` or packaging output.
- Type checking, linting and production output stay with `tsc --noEmit`, ESLint and `heft build`.

### Dev vs production differences a newcomer must expect

| | `heft start` / production | `fast-serve` |
|---|---|---|
| Unit of loading | one AMD bundle per `config.json` bundle | one ES module graph for the whole page; all bundles share one instance of each module |
| React | the production React shipped by SharePoint | the development build from the project's `node_modules` (needed for Fast Refresh) |
| `@microsoft/sp-*` | webpack externals resolved by the page | loaded on demand from the page, same instances and tenant version as production |
| Edit | rebuild + page reload | hot update, state kept where possible ([HMR, Fast Refresh and Vite terms](hmr-and-vite-terms.md)) |

### Versions

- `spfx-fast-serve-helpers` follows the SPFx version: `~1.24.0` serves SPFx 1.24.x (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`); the installed SPFx `major.minor` is checked at start.
- SPFx up to 1.21 (gulp/webpack) is served by the classic spfx-fast-serve with `spfx-fast-serve-helpers@~1.21.0` or earlier; SPFx 1.22 and 1.23 are not supported.
- Node.js versions: those supported by SPFx 1.24 (22 from 22.14, 24, 26).

## Links

- [SharePoint debug flow](sharepoint-debug-flow.md)
- [Component manifests and the SharePoint loader](component-manifests-and-loader.md)
- [SPFx component types](spfx-component-types.md)
- [HMR, Fast Refresh and Vite terms](hmr-and-vite-terms.md)
- [Glossary](glossary.md)
- [Architecture overview](../architecture/overview.md)

## Evidence

- Source: research (reverse-engineered SPFx 1.24.1 Heft pipeline and `heft start`), project docs, implementation behavior
- Confidence: high
- Last checked: 2026-11-18
