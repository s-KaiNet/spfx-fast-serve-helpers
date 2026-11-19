---
title: Roadmap overview
type: roadmap
status: current
tags:
  - project-kb
  - roadmap
  - status
---

# Roadmap overview

## Summary

The Rspack implementation reaches parity with the Vite implementation in three phases and ends with a benchmark against Vite fast-serve, `heft start` and Vite's bundled dev mode. Status: phase 0 done; in phase 1 the CLI with options, the project model, the Rspack compile and the HTTPS dev server with debug manifests and debug URL and HMR with React Fast Refresh are done (`1.24.0-rspack.4`): web parts render on a SharePoint page, edits hot-update with state kept (also with several bundles on one page) and class edits reload. Phase 2 is done (`1.24.0-rspack.5`): extensions through serve configurations and `--config` (Application Customizer, Command Set, Form Customizer live) with startup warnings, and ACEs on the hosted workbench; in phase 3 (parity) SPFx libraries as externals (deep imports bundled like heft), `config.json` externals and localization are done (`1.24.0-rspack.6`), then Sass/CSS modules with heft's class names and theme tokens, SCSS and static asset typings and tsconfig handling (`1.24.0-rspack.7`); error overlay, terminal output and the rest follow.

## Current Knowledge

### Phases

| Phase | Goal | Content |
|---|---|---|
| 0 | scaffold | plan, package with Rspack dependencies, fresh KB |
| 1 | web parts on the page with HMR | CLI and options, project model, Rspack compile (entries, SWC, AMD output, SPFx library externals), HTTPS dev server, debug manifests and URL, HMR and React Fast Refresh (several bundles per page) |
| 2 | all component types | extensions with serve configurations and `--config`, Adaptive Card Extensions |
| 3 | parity and comparison | complete SPFx library externals, `config.json` externals, localization, Sass/CSS modules/theme tokens, typings, tsconfig handling, error overlay and terminal output, browser errors in the terminal, regression tests for `require()`/AMD, option completion and restarts, an Rspack extend file with `defineConfig`, the heft-customization hint, the agent skill, performance tuning, docs, acceptance run, final benchmark |

### Expected not to be needed (Vite-era features)

AMD shim and ES module entry, on-demand library facades, named-import rewriting for externals (confirmed not needed: webpack semantics verified for all import forms), `require()` rewriting, AMD isolation for dependencies and its opt-out option (`amdPackages` is already ignored with a warning), type-only re-export guard, pre-bundling and warmup, the HTTP/2 status-message warning workaround. Each is confirmed by a regression test or by the reason that the mechanism doesn't exist with Rspack.

### Open questions

- CSS pipeline: the project's `@microsoft/sp-css-loader` is used (exact heft class names and tokens, verified); a fully own CSS-modules pipeline was not needed.
- Extend file formats beyond `.mjs` (TypeScript needs Node type stripping).
- Whether the Rspack line is published or stays local until the benchmark decides.

### Out of scope for now

Library components, SPFx 1.22/1.23, tunnels and remote hosts beyond what the Vite implementation supported.

## Links

- [Rspack compile](../features/rspack-compile.md)
- [HMR and React Fast Refresh](../features/hmr.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Project model](../architecture/project-model.md)
- [Architecture overview](../architecture/overview.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [Rspack facts and references](../references/rspack.md)
- [SPFx component types](../concepts/spfx-component-types.md)

## Evidence

- Source: Rspack branch plan (2026-11-19)
- Confidence: high for scope; task sizes are estimates
- Last checked: 2026-11-19
