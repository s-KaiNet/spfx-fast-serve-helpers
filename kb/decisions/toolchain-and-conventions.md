---
title: Package toolchain and code conventions
type: decision
status: current
tags:
  - project-kb
  - decision
  - toolchain
  - typescript
  - oxlint
  - pnpm
---

# Package toolchain and code conventions

## Summary

The package itself is developed with pnpm, built with TypeScript 7 and linted with oxlint using type-aware rules (`oxlint-tsgolint`), not ESLint with typescript-eslint. Code written for the project carries no comments, and the published package ships without source maps. Work follows an explicit process: discovery and approval before building, and no commit, push or publish without the user asking.

## Context

The package is a Node ESM CLI plus a small amount of browser runtime code. The user wanted a fast, modern toolchain and a codebase that explains itself through structure and naming.

## Decision

- **pnpm** for dependencies (`packageManager` is pinned in `package.json`); users of the package may use npm or pnpm.
- **TypeScript 7** (`typescript` `^7`) compiles the Node code and, with a separate DOM-only config, the browser runtime; scripts `pnpm build`, `pnpm dev`, `pnpm typecheck`.
- **oxlint with type-aware rules** (`pnpm lint` = `oxlint --type-aware --deny-warnings`, config in `.oxlintrc.json`) instead of ESLint/typescript-eslint; vitest for tests; `prepublishOnly` runs lint, typecheck, tests and build.
- **No code comments** (`//`, `/* */`, JSDoc) in code agents or developers write; names and structure must carry the meaning. This is an agent instruction for the repository.
- **No source maps in the package**: both the Node build and the runtime build have source maps off, and tests are excluded from the published files. (Source maps for the user's code are produced by Vite at serve time and are unaffected.)
- **Process**: discovery and research reports before building; ask when scope is unclear; nothing is committed, pushed or published unless the user asks.

## Rationale

- TypeScript 7 and oxlint are native tools: fast type checking and linting keep the feedback loop of the package itself short, matching the project's own goal.
- Type-aware oxlint covers the rules typescript-eslint would provide without a second, slower toolchain.
- Comment-free code avoids comments drifting from behavior; research reports and this KB hold the explanations.
- Runtime code is concatenated into generated scripts, where package source maps would not help users; leaving them out keeps the package small (inferred rationale).

## Consequences

- Contributors need pnpm and Node versions supported by the package (`>=22.14 <23`, 24, 26).
- Explanations of non-obvious behavior live in the KB and research notes, not in the code.
- Debugging the package's own code in a user project relies on the compiled JavaScript.

## Links

- [Build from scratch with semantic modules](semantic-architecture.md)
- [Architecture overview](../architecture/overview.md)

## Evidence

- Source: repository agent instructions, package manifest and build configs, project handoff notes
- Confidence: stated (tools, rules, process), medium (rationale for TypeScript 7/oxlint and for no package source maps)
- Last checked: 2026-11-18
