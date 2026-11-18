---
title: Architecture overview
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - vite
  - data-flow
---

# Architecture overview

## Summary

`fast-serve` is a zero-config CLI that runs Vite programmatically (no user `vite.config`, no public plugin entry) and makes a Vite dev server look like `heft start` to SharePoint. Data flows one way: **config → project model → generated artifacts → Vite server → browser runtime**. Each feature is a self-contained component that contributes Vite plugin(s) plus, where needed, browser code; all components share one read-only serve context (project root, resolved options, project model, logger). This page lists the components, their boundaries and dependency rules, and what is reused from the user's project versus shipped with the package.

## Current Knowledge

### Data flow

1. **Configuration**: CLI flags, `config/fast-serve.json`, `config/serve.json` and defaults are merged into resolved options (port, origin, page URL, locale, selected serve configuration, overlay).
2. **Project model**: SPFx facts read from the project on disk: bundles and components from `config/config.json`, component manifests, `serve.json` serve configurations, SPFx libraries in `node_modules`, `config.json` `externals`, localized resources, the `tsconfig.json` chain, the installed SPFx version.
3. **Generated artifacts**: computed on request from the model: the debug `manifests.js`, one AMD bundle shim and one ESM bundle entry per bundle, library facades, localization modules, typings files.
4. **Vite server**: HTTPS on `localhost`, module transforms, dependency pre-bundling, HMR socket, file watching.
5. **Browser runtime**: code that runs inside the SharePoint page: the bundle shim and library loader (classic scripts), the themed-styles runtime and the browser-errors runtime (ES modules), plus Vite's client and the React Fast Refresh preamble.

Startup, page load, edit and failure paths are traced in [Startup and request flows](runtime-flows.md).

### Components and responsibilities

| Component | Responsibility |
|---|---|
| CLI and dev server bootstrap | argument parsing, process wiring (exit code 1 on startup failure, clean shutdown on SIGINT/SIGTERM), startup order, ready banner with components and the debug page URL |
| Configuration | option precedence (CLI > `config/fast-serve.json` > `config/serve.json` > defaults), `{tenantDomain}` substitution from `SPFX_SERVE_TENANT_DOMAIN`, serve configuration and page selection like heft |
| Project model | everything SPFx-specific that can be read from disk (see above); cached, invalidated per changed file |
| Manifests | `GET /temp/build/manifests.js`: debug manifests per component, relative `./` icon URLs made absolute |
| Loader | the bundle shim (`/@spfx/bundle/<bundle>.js`), the generated bundle entry (`/@spfx/entry/<bundle>`), the last-server-error record and `/@spfx/status`, pre-bundling entries |
| Externals | facades for SPFx libraries and `config.json` externals in both the normal and the pre-bundling pipeline; the `scriptResources` the manifests list; local external files at `/@spfx/external/<name>.js` |
| Aliases | tsconfig `paths`/`baseUrl` resolution for project scripts |
| Localization | `*Strings` imports → modules built from `loc/<locale>` files |
| Styles | SPFx CSS module naming, `~` Sass imports, `config/sass.json` `silenceDeprecations` for Sass, theme tokens, library `.module.scss.css` compilation, Sass typings |
| Assets | static-asset typings |
| Transforms | source compatibility: tsconfig options for Oxc, defines, `require()` → imports, type-only name and `const enum` checks |
| Browser errors | browser errors → terminal (source-mapped, code frame) and Vite's overlay; overlay hint |
| Server | HTTPS certificate, port/origin, CORS and Private Network headers, watch ignores, React dedupe, project-change reloads/restarts, debug URL and serve configuration warnings |
| Browser runtime | the browser-side code of the loader, externals, styles and browser-errors components, built separately for the DOM |

How a single project module passes through these components is described in [Source pipeline](source-pipeline.md); SPFx library loading in [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md).

### Dependency rules and invariants

- **The project model is plain Node and never imports Vite.** It knows SPFx, not the dev server, so it can be reasoned about (and tested) on its own. Everything Vite-specific lives in the feature components.
- **One feature = one component** that returns its Vite plugin(s), contributes its own Vite config through the plugin `config()` hook, and owns its browser runtime. A composition step lists the plugins in a fixed order; there is no central Vite config object.
- **Generated artifacts are derived, never stored**: manifests, shims and entries are rendered from the current model on each request, so a model invalidation is enough to change them.
- **Browser runtime code shares only type contracts with Node code.** It is built with a DOM-only TypeScript config; classic-script parts are concatenated into the bundle shim, ES-module parts are served as virtual modules.
- Plugins that run inside dependency pre-bundling declare hook filters, so Rolldown only calls into JavaScript for matching module ids (unfiltered hooks made pre-bundling about twice as slow).
- The design deliberately does not mirror the old webpack-based spfx-fast-serve-helpers structure (see [Build from scratch with semantic modules](../decisions/semantic-architecture.md)).

### Reused from the user's project vs shipped with the package

Shipped as package dependencies (installed with `fast-serve`, no `--legacy-peer-deps` needed): `vite` 8, `@vitejs/plugin-react` 6, `rolldown` (bundles TypeScript/ESM loc files), `@rushstack/debug-certificate-manager` (the SPFx dev certificate), `@rushstack/terminal`, `es-module-lexer`, `magic-string`, `picomatch`, `tinyglobby`.

Resolved from the project at runtime, so output matches the project's own Heft toolchain:

- **React and react-dom** from the project's `node_modules`, in their development build (Fast Refresh needs it), deduplicated and pre-bundled; the tenant's production React is not used for project code.
- **`@microsoft/sp-css-loader`** (directly or through `@microsoft/spfx-heft-plugins`) to compile libraries' `.module.scss.css` files with SPFx class-name hashing.
- **Heft plugins** found through the project and its SPFx build rig: `@rushstack/heft-sass-plugin`'s Sass processor for `temp/sass-ts` typings, the static-asset typings logic, `@rushstack/heft-config-file` and `@rushstack/rig-package` to read rig-aware `config/sass.json` (typings settings and `silenceDeprecations`) and `config/static-asset-typings.json`.
- **SPFx library packages** (`@microsoft/sp-*` and any package shipping an SPFx library manifest): only their manifest ids/versions and export names are read; the code itself always comes from the SharePoint page.

Runtime requirement: Node `>=22.14 <23`, `>=24 <25` or `>=26 <27`; ESM package with the `fast-serve` bin; `package.json` `exports` exposes only `./package.json`.

## Links

- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Startup and request flows](runtime-flows.md)
- [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md)
- [Source pipeline](source-pipeline.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Zero-config CLI without a public Vite plugin API](../decisions/zero-config-cli.md)

## Evidence

- Source: project handoff notes, package code layout notes, implementation behavior (plugin composition, project model, package manifest)
- Confidence: high
- Last checked: 2026-11-18
