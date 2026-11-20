---
title: Architecture overview
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - rspack
  - data-flow
---

# Architecture overview

## Summary

`fast-serve` (Rspack implementation) turns an SPFx 1.24 project into AMD bundles served from memory over HTTPS on `localhost`, plus a debug `manifests.js` that SharePoint's loader reads. Data flows config → project model → generated artifacts → Rspack compiler and dev server → browser runtime. Every part described here exists (status in the [Roadmap overview](../roadmap/overview.md)).

## Current Knowledge

### Data flow

1. **Config:** CLI flags, `fast-serve/config.json`, `config/serve.json`, defaults (flags win); see [CLI, options and startup](../features/cli-and-options.md). The optional `fast-serve/rspack.extend.*` is merged into the Rspack config in step 4.
2. **[Project model](project-model.md)** (plain Node, no bundler import): bundles and components from `config/config.json` mapped from `lib/` to `src/` entry files, source manifests, `serve.json` serve configurations, SPFx libraries found in `node_modules` (id, version), `config.json` externals, localized resources, tsconfig (through `extends`), merged `config/sass.json`, SPFx version.
3. **Generated artifacts:** entry modules for multi-component bundles (`export * as <exportName>`, virtual modules inside the compiler), the debug `manifests.js` rendered on request, SCSS and static-asset typings in heft's `temp/` folders.
4. **Rspack compiler and dev server:** one compilation, one entry per SPFx bundle, `output.library.type: 'amd'`, `externalsType: 'amd'` for SPFx libraries and `config.json` externals, absolute `publicPath` on the dev server, `builtin:swc-loader` with tsconfig-derived options, Sass and CSS modules with SPFx class names and theme tokens, React Refresh; `@rspack/dev-server` over HTTPS with the SPFx dev certificate, CORS and Private Network Access headers.
5. **Browser runtime:** SharePoint's RequireJS loads each bundle like a heft bundle; Rspack's HMR runtime and React Refresh run inside it, one refresh runtime per bundle and the shared hot-update global fanned out to every bundle's runtime; a fast-serve page runtime at the top of `manifests.js` and as the first module of every bundle (installs once per page) forwards project errors to the terminal, draws the single error overlay and makes bundle load failures readable ([Errors, overlay and terminal output](../features/errors-and-diagnostics.md)).

### Responsibilities

| Component | Owns |
|---|---|
| CLI and options | flags, `fast-serve/config.json`, precedence, version check, logging |
| Project model | SPFx facts, each read once per model; rebuilt on restart; no bundler types; the list of code roots (the project plus linked library projects) |
| Feature API | what every feature may use: the build context, the contribution and feature shapes, the page channel, the dev-server URL paths and small HTTP helpers; it imports no feature |
| Rspack config | the composition root: the ordered feature list, the merge of their contributions under the base configuration, the page channel for one build, compile-problem formatting shared by the server and the extend file, and the [persistent cache](../features/performance-and-cache.md) version |
| Manifests | debug `manifests.js`: source manifest + `loaderConfig` with the bundle and the externals it uses |
| Dev server | HTTPS, headers, debug URL and ready banner |
| Dev session | watching project configuration and the extend file, [restarts](../features/project-restarts.md) that swap the server only after the new config is ready |
| Extend file | loading `fast-serve/rspack.extend.*`, guard and merge into fast-serve's config, public `defineConfig` entry ([Rspack extend file](../features/rspack-extend-file.md)) |
| Features | entries, local libraries, TypeScript, externals, React, localization, assets, styles, defines, manifests, browser errors, HMR; each one folder with tests, exposed as a named feature |

### Features and the page channel

- Every feature has a name and one way to contribute: it receives the build context and returns a contribution (entries, rules, plugins, aliases, resolve extensions, externals, dev-server middlewares), synchronously or asynchronously. Features are called one after the other in a fixed, named order.
- Merge rules: rules, plugins and middlewares are appended in feature order; aliases and entries are merged so that a later feature wins (React comes after the local libraries, so the project's React alias wins); extensions and externals keep their first occurrence. The order of the list is pinned by tests (also: TypeScript rules come before style rules).
- Features never call each other. What they share with the page goes through the page channel of the build, which the dev server connects when it has started: **reload the pages** (no-op before the server runs and in one-shot compiles), **page script parts** rendered at request time at the top of the debug `manifests.js` (the browser-errors runtime is one), and **server-started hooks** that get the first-compile promise and a stop hook (typings watchers use them).

### Dependency rules

- The folder graph has no cycles: the CLI shell and the dev session sit on top, then the dev server, then the Rspack composition root, then the features, then the feature API, the project model, the options and the utilities. The project model never imports Rspack.
- Features depend on the feature API and the project model, not on each other's internals; across folders, code imports a folder through its public entry module only (the public package entry and the CLI's lazy imports of the extend-file helpers are the exceptions).
- SPFx and heft packages the project already has are loaded from the project at runtime; Rspack and its plugins are package dependencies.
- No heft webpack config or heft-plugin internals ([decision](../decisions/rspack-with-own-config.md)).

### Differences from the Vite implementation

- SharePoint loads real AMD bundles: no shim, no ES module graph, no on-demand library facades, no request-time transforms.
- Cost at start (one full compile) and per edit (incremental rebuild), instead of per page load.

## Links

- [Rspack compile](../features/rspack-compile.md)
- [HMR and React Fast Refresh](../features/hmr.md)
- [Dev server, debug manifests and debug URL](../features/dev-server.md)
- [Project model](project-model.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Rspack facts and references](../references/rspack.md)
- [Roadmap overview](../roadmap/overview.md)

## Evidence

- Source: implementation behavior; import-graph check (no folder cycles) and tests pinning the feature order after the architecture refactoring (`1.24.0-rspack.16`)
- Confidence: high
- Last checked: 2026-11-20
