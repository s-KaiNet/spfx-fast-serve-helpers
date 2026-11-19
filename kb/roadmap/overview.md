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

The Rspack implementation reaches parity with the Vite implementation in three phases and ends with a benchmark against Vite fast-serve, `heft start` and Vite's bundled dev mode. Status: phase 0 done; in phase 1 the CLI with options, the project model, the Rspack compile and the HTTPS dev server with debug manifests and debug URL are done (`1.24.0-rspack.3`): web parts and extensions in the default serve configuration render on a SharePoint page and every edit reloads the page; HMR with React Fast Refresh is next. The compile already contains initial localization, asset and Sass/CSS handling that later tasks complete.

## Current Knowledge

### Phases

| Phase | Goal | Content |
|---|---|---|
| 0 | scaffold | plan, package with Rspack dependencies, fresh KB |
| 1 | web parts on the page with HMR | CLI and options, project model, Rspack compile (entries, SWC, AMD output, SPFx library externals), HTTPS dev server, debug manifests and URL, HMR and React Fast Refresh (several bundles per page) |
| 2 | all component types | extensions with serve configurations and `--config`, Adaptive Card Extensions |
| 3 | parity and comparison | complete SPFx library externals, `config.json` externals, localization, Sass/CSS modules/theme tokens, typings, tsconfig handling, error overlay and terminal output, browser errors in the terminal, regression tests for `require()`/AMD, option completion and restarts, an Rspack extend file with `defineConfig`, the heft-customization hint, the agent skill, performance tuning, docs, acceptance run, final benchmark |

### Expected not to be needed (Vite-era features)

AMD shim and ES module entry, on-demand library facades, named-import rewriting for externals, `require()` rewriting, AMD isolation for dependencies and its opt-out option (`amdPackages` is already ignored with a warning), type-only re-export guard, pre-bundling and warmup, the HTTP/2 status-message warning workaround. Each is confirmed by a regression test or by the reason that the mechanism doesn't exist with Rspack.

### Open questions

- CSS pipeline: the project's `@microsoft/sp-css-loader` (exact heft class names and tokens) or a fully own CSS-modules pipeline.
- Extend file formats beyond `.mjs` (TypeScript needs Node type stripping).
- Several bundles: per-runtime hot-update global vs one compiler per bundle.
- Whether the Rspack line is published or stays local until the benchmark decides.

### Out of scope for now

Library components, SPFx 1.22/1.23, tunnels and remote hosts beyond what the Vite implementation supported.

## Links

- [Rspack compile](../features/rspack-compile.md)
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
