---
title: Dev server only; Heft keeps builds, checks and packaging
type: decision
status: current
tags:
  - project-kb
  - decision
  - scope
  - heft
---

# Dev server only; Heft keeps builds, checks and packaging

## Summary

`fast-serve` replaces `heft start` for development and nothing else. Production bundles, `.sppkg` packaging, type checking and linting stay with Heft and the project's own tools. The only files `fast-serve` writes are typings in the same `temp/` folders Heft uses, with byte-identical content.

## Context

SPFx 1.22+ builds with Heft; `heft start` rebuilds the whole solution on every edit (seconds per change, about 20 s start for a large project) and has no real HMR. The previous spfx-fast-serve wrapped the gulp/webpack build and is not applicable to Heft. A full replacement of the Heft pipeline would have to reproduce production manifests, bundling and packaging, which change with each SPFx release.

## Decision

- Scope is a **development server only**; it never produces production builds. `heft build`, `heft test` and `heft package-solution` are unchanged, and nothing `fast-serve` does ends up in the `.sppkg`.
- Not provided by design: type checking, ESLint/linting, a CORS/allowed-origins option, a `debug` flag, logging levels, a `hotRefresh` flag (HMR is always on), a `memory` setting, React profiling. Users run `tsc --noEmit`, ESLint or `heft build` separately.
- No `lib/` or `dist/` output. The only writes are `temp/sass-ts/**/*.module.scss.d.ts` and `temp/static-asset-ts/**/*.d.ts`, the folders the SPFx rig's `tsconfig` already reads through `rootDirs`. They are generated with Heft's own logic (the Sass processor of `@rushstack/heft-sass-plugin`, the static-asset typings logic, rig-aware `config/sass.json` / `config/static-asset-typings.json`), resolved from the project.

## Rationale

- The slow part of the loop is the edit → rebuild → reload cycle; the build and packaging are already correct in Heft, and duplicating them would add risk without improving the inner loop.
- Keeping type checking and linting out keeps the server's work per edit tiny (tens of milliseconds) and avoids a second, possibly different, source of diagnostics.
- Typings must exist while serving, or the IDE flags new CSS classes and assets as errors. Writing them where Heft writes them, with Heft's code, means `heft build` overwrites them with identical content and nothing new appears in the project.

## Consequences

- Every change must still be checked with `heft build` / `heft package-solution` before shipping; dev and production differ in known ways (unbundled ES modules, one shared module graph, development React).
- Type errors only show in the IDE or in a separate `tsc` run, never in the `fast-serve` terminal or overlay.
- When Heft changes its typings logic in a new SPFx release, the output follows automatically because the code comes from the project's toolchain.

## Links

- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [Styles, theme tokens and asset typings](../features/styles-and-assets.md)
- [Zero-config CLI without a public Vite plugin API](zero-config-cli.md)
- [Version policy: package follows the SPFx minor](version-policy.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, user docs (migration, limitations), implementation behavior (typings components)
- Confidence: stated
- Last checked: 2026-11-18
