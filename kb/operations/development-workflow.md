---
title: Development workflow and toolchain
type: operation
status: current
tags:
  - project-kb
  - operations
  - toolchain
  - pnpm
  - typescript
  - oxlint
  - vitest
---

# Development workflow and toolchain

## Summary

The package is a Node ESM CLI plus a small browser runtime, developed with pnpm, compiled with TypeScript 7, linted with type-aware oxlint and tested with vitest. The Node code and the browser runtime are compiled separately, with different TypeScript settings, into one `lib/` folder that is the only published content. This page covers the day-to-day commands, the code and test conventions, and the steps before a release.

## Current Knowledge

### Requirements

- Node versions supported by SPFx 1.24: `>=22.14.0 <23`, `>=24 <25` or `>=26 <27` (`engines` in `package.json`).
- pnpm; the exact version is pinned through `packageManager`. Use pnpm for every dependency change in this repository (users of the package may install it with npm or pnpm).

### Package scripts

| Script | What it does |
|---|---|
| `pnpm build` | cleans `lib/`, then compiles the Node code, the type declarations of the public entry (`defineConfig` and types) and the browser runtime with TypeScript 7 |
| `pnpm dev` | watch build of the Node code only; run `pnpm build` after changing browser runtime code |
| `pnpm typecheck` | type-checks both the Node code and the runtime without emitting |
| `pnpm lint` | `oxlint --type-aware --deny-warnings` (type-aware rules via `oxlint-tsgolint`; any warning fails) |
| `pnpm test` / `pnpm test:watch` | vitest run / watch |
| `prepublishOnly` | lint, typecheck, test and build; runs automatically before publishing |

The lint configuration (`.oxlintrc.json`) turns the correctness, suspicious and perf categories into errors and adds a strict set of type-aware rules (no unsafe `any` flows, no floating or misused promises, no unnecessary conditions). Research notes and test fixtures are excluded from linting.

### Two compilation targets

- **Node code**: strict TypeScript, `NodeNext` modules (relative imports carry `.js` extensions), ES2023, `verbatimModuleSyntax`. Source maps are on for local development, off in the published build; test files are excluded from the build.
- **Browser runtime**: its own DOM-only configuration (no Node types), ES2022, compiled into a runtime folder inside `lib/`. These files are served to, or concatenated into generated scripts for, the SharePoint page (the bundle shim, the library loader, themed styles, browser error reporting). When tests run from sources, runtime files are transpiled on the fly, so tests don't need a prior build.
- The published package contains `lib/` without test files, plus the `skills/` folder with the `fast-serve-vite-config` agent skill. `package.json` `exports` exposes the public entry (`defineConfig` and types, with declarations emitted for that entry only) and `./package.json`; the `fast-serve` bin is the CLI entry point. Current version: `1.24.0-beta.1`.

### Conventions

- **No code comments** of any kind (`//`, `/* */`, JSDoc) in code written for the project; names and structure carry the meaning, and explanations live in this KB and the research notes.
- **Feature = one component**: a feature returns its Vite plugin(s), each contributing its own Vite config, plus its browser runtime and tests (see [Architecture overview](../architecture/overview.md)).
- The project model stays free of Vite imports, so it is testable as plain Node.
- Plugins that run inside dependency pre-bundling must declare hook filters; unfiltered hooks made pre-bundling about twice as slow.
- **Tests live next to the code** and run with vitest. Behavior that depends on an SPFx project is tested against small fake SPFx projects used as fixtures: a minimal `package.json`, `config/config.json`, `config/serve.json` and tsconfig chain, a few web parts, extensions and an ACE, and a hand-made `node_modules` with stub `@microsoft/sp-*` packages and SPFx library manifests. Separate fixtures cover multi-component bundles, pre-bundling, decorators, SCSS typings and type-only names.
- Behavior that relies on Vite internals is pinned by tests against the installed Vite (for example, the overlay hint checks that the text it rewrites still exists in Vite's client), so a Vite upgrade that breaks it fails the suite.
- Unit tests cannot cover a real SharePoint page; anything touching the page, the loader or HMR is verified live (see [Live verification on a SharePoint tenant](live-verification.md)).

### Process rules

- Discovery and research before building; ask the user when scope is unclear (see [Package toolchain and code conventions](../decisions/toolchain-and-conventions.md)).
- Nothing is committed, pushed or published unless the user asks.
- Before publishing: rebuild the tarball, re-run the acceptance checks in both test projects (see [Local testing and consumer setup](local-testing-and-consumer-setup.md)), and optionally re-run the [benchmark](benchmark-method.md).

## Links

- [Package toolchain and code conventions](../decisions/toolchain-and-conventions.md)
- [Architecture overview](../architecture/overview.md)
- [Local testing and consumer setup](local-testing-and-consumer-setup.md)
- [Live verification on a SharePoint tenant](live-verification.md)

## Evidence

- Source: package manifest and TypeScript/oxlint configs, package code layout notes, repository agent instructions, project handoff notes
- Confidence: high
- Last checked: 2026-11-19
