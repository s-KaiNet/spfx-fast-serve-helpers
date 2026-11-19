---
title: One compilation for several bundles
type: decision
status: current
tags:
  - project-kb
  - decision
  - hmr
  - rspack
---

# One compilation for several bundles

## Summary

All SPFx bundles of a project are built by one Rspack compilation (one entry per bundle). For HMR with several bundles on one page, the shared hot-update global is fanned out to every bundle's runtime by a few lines appended to Rspack's runtime, and the React Refresh runtime is injected per bundle. The alternative, a `MultiCompiler` with one `uniqueName` per bundle, was measured and rejected.

## Context

Each bundle has its own Rspack runtime, but all of them install their hot-update handler on the same global (derived from `output.uniqueName`), so without a fix the last loaded bundle swallows the updates of the others. The two candidates from the prototype: distinct or shared-but-dispatching globals in one compilation, or one compiler per bundle.

## Decision

One compilation plus the fan-out runtime addition (see [HMR](../features/hmr.md)).

## Measurements (watch mode with HMR, same machine, 2 runs each)

| Project | Variant | First compile | RSS after compile / after 8 edits | Rebuild per edit |
|---|---|---|---|---|
| spfx-rea (5 bundles) | one compilation | 0.56 s | 0.23 / 0.28–0.29 GB | 65–124 ms |
| spfx-rea | `MultiCompiler` | 0.58–0.60 s | 0.23–0.26 / 0.28–0.29 GB | 16–57 ms |
| spfx-bench (2 bundles) | one compilation | 1.55–1.58 s | 0.43–0.45 / 0.54 GB | 79–228 ms |
| spfx-bench | `MultiCompiler` | 1.63–1.66 s | 0.47 / 0.52–0.53 GB | 80–147 ms |
| spfx-bench, each bundle ×5 (10 bundles sharing modules) | one compilation | 1.72–1.89 s | 0.56–0.64 / 0.70–0.75 GB | 250–470 ms |
| same | `MultiCompiler` | 5.1–5.3 s | 0.89–0.94 / 1.0 GB | 230–320 ms |

## Rationale

- `MultiCompiler` rebuilds are faster per edit (a smaller compilation re-renders only its own runtime), but start time and memory grow with the number of bundles that share modules, because every compiler parses and keeps React, Fluent UI etc. again; real SPFx projects often have many bundles sharing those dependencies.
- One compilation keeps one module graph, one watcher, one stats object for terminal output, the overlay and the per-bundle `scriptResources` collection; `MultiCompiler` would need per-compiler plugin instances and merged stats.
- The fan-out is a small, local runtime addition that also covers async chunks shared by several bundles, where a per-runtime rename of the global would not.

## Consequences

- Every edit changes the compilation hash, so every bundle's runtime on the page checks for an update; unaffected bundles receive an empty update and do nothing.
- The fan-out depends on Rspack's hot-update handler ignoring chunk ids it did not request (true for Rspack 2.3) and on runtime-module source changes being allowed (not with `experiments.runtimeMode: 'rspack'`).

## Links

- [HMR and React Fast Refresh](../features/hmr.md)
- [Rspack compile](../features/rspack-compile.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: a measurement script compiling the project copies with both variants in watch mode with `HotModuleReplacementPlugin`, writing edits to one file per bundle and timing write → `done`; Rspack 2.3.3 runtime output for the hot-update handler
- Confidence: medium (two runs per variant, one machine)
- Last checked: 2026-11-19
