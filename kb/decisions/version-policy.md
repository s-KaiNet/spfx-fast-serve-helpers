---
title: "Version policy: package follows the SPFx minor"
type: decision
status: current
tags:
  - project-kb
  - decision
  - versioning
  - spfx
---

# Version policy: package follows the SPFx minor

## Summary

The package keeps the classic name `spfx-fast-serve-helpers`, and its version follows the SPFx version it serves: `~1.24.0` serves SPFx 1.24.x only. `fast-serve` checks the installed SPFx `major.minor` at start and refuses to run on a mismatch. SPFx 1.22 and 1.23 are not supported; 1.23 support has been researched but not decided.

## Context

`fast-serve` depends on details that change between SPFx minors: Heft plugin internals (Sass processor, static-asset typings, `sp-css-loader`), the rig's `tsconfig`, CSS module rules, the React version and entry points, manifest shapes. The classic spfx-fast-serve used the same name with a version locked to the SPFx minor (`~1.21.0` for SPFx 1.21), and users know that scheme.

## Decision

- Package name `spfx-fast-serve-helpers`, version `1.<spfxMinor>.x` (currently `1.24.0-beta.0`); users install `spfx-fast-serve-helpers@~1.24.0`.
- At start the installed SPFx version (from `@microsoft/sp-core-library`, then the SPFx Heft plugins) must have the package's `major.minor`; otherwise `Unsupported SPFx version` with a hint (classic spfx-fast-serve for ≤ 1.21, upgrade for 1.22/1.23, a newer release for newer SPFx).
- Supported now: SPFx 1.24.x only. SPFx ≤ 1.21 stays on the classic spfx-fast-serve with `spfx-fast-serve-helpers@~1.21.0` or earlier.
- A tenant serving a newer SPFx than the project is fine (production behaves the same); a project newer than the tenant gets a clear message instead of a cryptic load error.

## Rationale

- Locking to one minor lets the package rely on that minor's exact toolchain without compatibility branches, and makes a mismatch an explicit error rather than subtle misbehavior.
- Reusing the name and scheme makes the Vite version the natural successor of the classic tool for Heft-based SPFx.

## Consequences

- Every new SPFx minor needs a new package release (diff the Heft pipeline, rig configs and React externals, then adjust).
- SPFx 1.23 projects must upgrade to 1.24 first. Research found 1.23 cheap to add as one package for `>=1.23 <1.25` with a per-minor profile (main gap: in 1.23 every non-`.global` style file is a CSS module), but that is not decided.
- Node versions follow SPFx 1.24: `>=22.14 <23`, 24 or 26.

## Links

- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Dev server only; Heft keeps builds, checks and packaging](dev-server-only.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, package manifest, user docs, SPFx 1.23 support research
- Confidence: stated
- Last checked: 2026-11-18
