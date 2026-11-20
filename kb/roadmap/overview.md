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

The Rspack implementation reaches parity with the Vite implementation in three phases and ends with a benchmark against Vite fast-serve and `heft start`. Status: phase 0 done; in phase 1 the CLI with options, the project model, the Rspack compile and the HTTPS dev server with debug manifests and debug URL and HMR with React Fast Refresh are done (`1.24.0-rspack.4`): web parts render on a SharePoint page, edits hot-update with state kept (also with several bundles on one page) and class edits reload. Phase 2 is done (`1.24.0-rspack.5`): extensions through serve configurations and `--config` (Application Customizer, Command Set, Form Customizer live) with startup warnings, and ACEs on the hosted workbench; in phase 3 (parity) SPFx libraries as externals (deep imports bundled like heft), `config.json` externals and localization are done (`1.24.0-rspack.6`), then Sass/CSS modules with heft's class names and theme tokens, SCSS and static asset typings and tsconfig handling (`1.24.0-rspack.7`), then the error overlay, terminal output, browser errors in the terminal with readable load errors, and the `require()`/AMD regression tests (`1.24.0-rspack.8`), then restarts on project changes, the Rspack extend file with `defineConfig`, the webpack-customization hint and the agent skill (`1.24.0-rspack.9`); then the persistent cache and startup tuning, the user README and the acceptance run on both test projects (`1.24.0-rspack.10`). The final benchmark against the Vite implementation and `heft start` is done (`1.24.0-rspack.11`, [final benchmark](../operations/final-benchmark.md)); Vite's bundled dev mode was dropped from it. All planned tasks are done. After a user report, `1.24.0-rspack.12` closes the runtime-error overlay after the fix and documents the npm peer conflict with `css-loader` 7.1.2 ([limitation](../limitations/npm-css-loader-peer-conflict.md)). `1.24.0-rspack.13` warns about deep library imports only from project code and names the importing file. `1.24.0-rspack.14` resolves Sass `~` and `pkg:` imports like heft (package folder, `exports` ignored, so the classic `SPFabricCore.scss` import compiles) and hashes class names like heft's development build (without the source-map comment line). `1.24.0-rspack.15` compiles linked library component projects from source in the consumer, with Fast Refresh across projects and a `deployedLibraries` opt-out ([local library projects](../features/local-library-projects.md)).

## Current Knowledge

### Phases

| Phase | Goal | Content |
|---|---|---|
| 0 | scaffold | plan, package with Rspack dependencies, fresh KB |
| 1 | web parts on the page with HMR | CLI and options, project model, Rspack compile (entries, SWC, AMD output, SPFx library externals), HTTPS dev server, debug manifests and URL, HMR and React Fast Refresh (several bundles per page) |
| 2 | all component types | extensions with serve configurations and `--config`, Adaptive Card Extensions |
| 3 | parity and comparison | complete SPFx library externals, `config.json` externals, localization, Sass/CSS modules/theme tokens, typings, tsconfig handling, error overlay and terminal output, browser errors in the terminal, regression tests for `require()`/AMD, option completion and restarts, an Rspack extend file with `defineConfig`, the heft-customization hint, the agent skill, performance tuning, docs, acceptance run, final benchmark |

### Expected not to be needed (Vite-era features)

AMD shim and ES module entry, on-demand library facades, named-import rewriting for externals (confirmed not needed: webpack semantics verified for all import forms), `require()` rewriting, AMD isolation for dependencies, its opt-out option and the mismatch hint (all confirmed not needed by the [require() and AMD](../features/require-and-amd.md) regression tests; `amdPackages` is ignored with a warning), the AMD-mismatch, `const enum`/missing-export and computed-`require` browser-error hints, type-only re-export guard, pre-bundling and warmup, the HTTP/2 status-message warning workaround. Each is confirmed by a regression test or by the reason that the mechanism doesn't exist with Rspack.

### Open questions

- CSS pipeline: the project's `@microsoft/sp-css-loader` is used (exact heft class names and tokens, verified); a fully own CSS-modules pipeline was not needed.
- Extend file formats: decided, `.mjs`/`.mts`/`.js`/`.ts`/`.cjs`/`.cts` all work on Node 22.14+ because fast-serve bundles the file with Rspack and SWC (no Node type stripping needed).
- Whether the Rspack line is published: the benchmark recommends it for projects from about 100 components (or with large dependency trees) and the Vite line for small projects; the publishing decision is open.

### Out of scope for now

A library served on its own (library mode with a debug manifest, loaded by id) and a workspace mode serving several solutions from one server; SPFx 1.22/1.23, tunnels and remote hosts beyond what the Vite implementation supported.

## Links

- [Acceptance run on the test projects](../operations/acceptance-run.md)
- [Startup performance and the persistent cache](../features/performance-and-cache.md)
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
- Last checked: 2026-11-20
