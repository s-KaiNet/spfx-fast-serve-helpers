---
title: Rspack facts and references
type: reference
status: current
tags:
  - project-kb
  - reference
  - rspack
  - hmr
  - dependencies
---

# Rspack facts and references

## Summary

Versions, Rspack 2 behaviours and prototype findings the Rspack implementation relies on, plus the prototype's numbers against heft and the Vite implementation.

## Current Knowledge

### Versions (2026-11-19)

| Package | Version | Role |
|---|---|---|
| `@rspack/core` | 2.3.3 | compiler, `builtin:swc-loader`, `DefinePlugin`, HMR runtime |
| `@rspack/dev-server` | 2.2.2 | HTTPS dev server, websocket, client overlay; built on `connect-next`, not Express; `selfsigned` peer is optional |
| `@rspack/plugin-react-refresh` | 2.0.3 | React Fast Refresh (peer `react-refresh` ≥ 0.10 < 1) |
| `react-refresh` | 0.19.0 | refresh runtime |
| `sass-loader` | 17.1.0 | Sass in Rspack; `sass`/`sass-embedded` are optional peers, so the project's Sass implementation is passed in |

All Rspack 2 packages are pure ESM.

### Rspack 2 behaviours that matter

- `output.hashFunction: 'md5'` panics on the Rust side; use `xxhash64` (or `md4`, `sha256`).
- `output.libraryTarget` is ignored; use `output.library.type: 'amd'`.
- AMD externals need `externalsType: 'amd'`; otherwise externals are emitted as `module.exports = <name>` with an empty dependency list.
- `module.parser.javascript.exportsPresence` defaults to `error` (webpack 5 warns); heft only filters "export … was not found" warnings, so `auto` plus a warning filter matches heft.
- webpack plugins that use webpack-only hooks don't run: `Compilation.hooks.afterOptimizeChunkModules`, `JavascriptModulesPlugin.getCompilationHooks().render`. A `webpack.DefinePlugin` instance must be replaced by `rspack.DefinePlugin`. JavaScript loaders (`sass-loader`, `@microsoft/sp-css-loader`, `html-loader`) run unchanged.
- Rspack's `ExternalModule` has `userRequest` but no `externalType` (matters only when reading modules from stats/plugins).

### HMR inside SharePoint pages (prototype findings)

- HMR works inside AMD bundles loaded by the page's RequireJS: the client gets a hash over the websocket, fetches `<bundle>.<hash>.hot-update.json` and loads the update chunk as a script from the absolute `publicPath`.
- **Several bundles on one page:** each bundle has its own runtime, but a shared `output.uniqueName` gives all of them the same `self["rspackHotUpdate<uniqueName>"]` global; the last bundle's handler wins and updates for the others are silently lost (no reload, no error). Fix: a distinct hot-update global per runtime (small plugin rewriting the emitted global), or a `MultiCompiler` with one `uniqueName` per bundle. heft's webpack config has the same shape, which likely explains heft's "auto reload only on the first edit with two bundles".
- **Nested React copies** (e.g. React 17 under `@pnp/spfx-controls-react`) give "Invalid hook call" once React is bundled; `resolve.alias` of `react`, `react-dom`, `react/jsx-runtime`, `react-dom/client` to the project's copy fixes it.
- An edit that reaches the bundle entry (the component class) falls back to a full page reload; CSS-module edits bubble to the importing component, which re-renders with the new class names.
- Rspack's compile-error overlay works over SharePoint pages.

### Prototype numbers (medians, live on SharePoint Online)

| | heft start | Vite fast-serve | Rspack prototype |
|---|---|---|---|
| small project: server ready | 7.4 s | 0.81 s | 1.75 s |
| small project: TSX edit → DOM | 2.47 s (reload) | 29 ms | 103 ms |
| 1000 modules: server ready | 23.4 s | 0.83 s | 2.80 s (≈0.9 s with persistent cache) |
| 1000 modules: edit → DOM | manual reload | 35–63 ms | 226–263 ms |
| 1000 modules: cold load / F5 | 3.56 / 2.61 s | 8.41 / 5.58 s | 3.75 / 2.48 s |
| 1000 modules: localhost requests per load | 6 | 1181 | 6 |
| 1000 modules: server RSS peak | 1.20 GB | 0.48 GB | 0.59 GB |

The prototype reused heft's generated config; the implementation writes its own, so these numbers are a baseline, not a result.

### External docs

- Rspack 2 announcement and the v1 → v2 migration guide (rspack.rs), Rspack cache configuration, `@rspack/plugin-react-refresh` on npm.
- `@rushstack/heft-rspack-plugin` exists but is a separate Heft task plugin for Rspack 1.x; SPFx's heft plugins only attach to the webpack 5 plugin, and heft has no hook to swap its compiler, so a fast Rspack dev server has to run outside heft.

## Links

- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [Architecture overview](../architecture/overview.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](spfx-heft-pipeline.md)
- [Roadmap overview](../roadmap/overview.md)

## Evidence

- Source: Rspack prototype research (2026-11-19, Rspack 2.3.3 against SPFx 1.24.1 test projects on a tenant serving 1.25.0), npm registry, Rspack docs
- Confidence: high for observed behaviours; numbers are single-machine medians (3 starts per server)
- Last checked: 2026-11-19
