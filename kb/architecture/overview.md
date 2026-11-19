---
title: Architecture overview
type: architecture
status: draft
tags:
  - project-kb
  - architecture
  - rspack
  - data-flow
---

# Architecture overview

## Summary

`fast-serve` (Rspack implementation) turns an SPFx 1.24 project into AMD bundles served from memory over HTTPS on `localhost`, plus a debug `manifests.js` that SharePoint's loader reads. Data flows config → project model → generated artifacts → Rspack compiler and dev server → browser runtime. This page describes the target shape; so far the CLI with options and the [project model](project-model.md) exist (see [Roadmap overview](../roadmap/overview.md)).

## Current Knowledge

### Data flow

1. **Config:** CLI flags, `fast-serve/config.json`, `config/serve.json`, defaults (flags win); see [CLI, options and startup](../features/cli-and-options.md).
2. **[Project model](project-model.md)** (plain Node, no bundler import): bundles and components from `config/config.json` mapped from `lib/` to `src/` entry files, source manifests, `serve.json` serve configurations, SPFx libraries found in `node_modules` (id, version), `config.json` externals, localized resources, tsconfig (through `extends`), merged `config/sass.json`, SPFx version.
3. **Generated artifacts:** entry modules for multi-component bundles (`export * as <exportName>`), the debug `manifests.js` rendered on request, SCSS and static-asset typings in heft's `temp/` folders.
4. **Rspack compiler and dev server:** one compilation, one entry per SPFx bundle, `output.library.type: 'amd'`, `externalsType: 'amd'` for SPFx libraries and `config.json` externals, absolute `publicPath` on the dev server, `builtin:swc-loader` with tsconfig-derived options, Sass and CSS modules with SPFx class names and theme tokens, React Refresh; `@rspack/dev-server` over HTTPS with the SPFx dev certificate, CORS and Private Network Access headers.
5. **Browser runtime:** SharePoint's RequireJS loads each bundle like a heft bundle; Rspack's HMR runtime and React Refresh run inside it, each bundle with its own hot-update global; small fast-serve runtimes add error forwarding to the terminal.

### Responsibilities

| Component | Owns |
|---|---|
| CLI and options | flags, `fast-serve/config.json`, precedence, version check, logging |
| Project model | SPFx facts, cached and invalidated on file changes; no bundler types |
| Rspack config | composition of feature contributions (rules, plugins, resolve, externals, dev-server middlewares) |
| Manifests | debug `manifests.js`: source manifest + `loaderConfig` with the bundle and the externals it uses |
| Dev server | HTTPS, headers, debug URL and ready banner, restarts on project-config changes |
| Features | HMR, externals, localization, styles, typings, tsconfig, errors, extend file, each one module with tests |

### Dependency rules

- The project model never imports Rspack; features depend on the model, not on each other's internals.
- SPFx and heft packages the project already has are loaded from the project at runtime; Rspack and its plugins are package dependencies.
- No heft webpack config or heft-plugin internals ([decision](../decisions/rspack-with-own-config.md)).

### Differences from the Vite implementation

- SharePoint loads real AMD bundles: no shim, no ES module graph, no on-demand library facades, no request-time transforms.
- Cost at start (one full compile) and per edit (incremental rebuild), instead of per page load.

## Links

- [Project model](project-model.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Rspack facts and references](../references/rspack.md)
- [Roadmap overview](../roadmap/overview.md)

## Evidence

- Source: Rspack branch plan and handoff (2026-11-19), Rspack prototype, Vite implementation architecture
- Confidence: medium (target design, not implemented yet)
- Last checked: 2026-11-19
