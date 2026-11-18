---
title: Build from scratch with semantic modules
type: decision
status: current
tags:
  - project-kb
  - decision
  - architecture
---

# Build from scratch with semantic modules

## Summary

The Vite version was written from scratch instead of porting the old webpack-based spfx-fast-serve-helpers structure. It is organized as semantic feature components around one data flow (config → project model → generated artifacts → Vite server → browser runtime), with an SPFx project model that never imports Vite and browser code written as real TypeScript.

## Context

The previous package wrapped SPFx's gulp/webpack build: global mutable settings imported everywhere, regex patching of generated files, browser code built from strings. With Heft and Vite almost none of that code applies, and the webpack-era code was removed from the repository before the rewrite.

## Decision

- Don't copy the old structure; build **semantic modules** with a clear data flow.
- One feature = one component that returns its Vite plugin(s), contributes its own Vite config, and owns its browser runtime and tests. A single composition step lists the plugins.
- The project model is plain Node: SPFx facts read from disk, cached and invalidated per changed file, with no Vite imports.
- Generated artifacts (manifests, shims, entries) are rendered from the current model on each request, never stored.
- Browser runtime code is TypeScript built for the DOM, sharing only type contracts with Node code.

## Rationale

- Responsibilities that follow SPFx concepts (manifests, loader, externals, styles, localization, transforms, errors) keep each change local and easy to review.
- A Vite-free project model can be reasoned about and unit-tested on its own, and survives Vite upgrades.
- Rendering on request removes cache-invalidation bugs between the model and generated files.

## Consequences

- New behavior is added as a new feature component or inside an existing one, never as cross-cutting configuration.
- Knowledge from the old package was reused as a checklist (options, gotchas, migration), not as code.

## Links

- [Architecture overview](../architecture/overview.md)
- [Zero-config CLI without a public Vite plugin API](zero-config-cli.md)
- [Package toolchain and code conventions](toolchain-and-conventions.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, the original serve plan, package code layout notes
- Confidence: stated
- Last checked: 2026-11-18
