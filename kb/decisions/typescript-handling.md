---
title: TypeScript handling without tsc
type: decision
status: current
tags:
  - project-kb
  - decision
  - typescript
  - tsconfig
  - oxc
---

# TypeScript handling without tsc

## Summary

Project TypeScript is compiled file by file by Vite's Oxc transform, not by `tsc`. To stay close to heft, `fast-serve` resolves tsconfig `paths` with its own resolver, passes a whitelist of compiler options to Oxc (with Oxc's tsconfig lookup off), removes type-only names that would break native ES modules and warns about them, and explains `const enum` cases it cannot support.

## Context

- SPFx projects extend the rig's base `tsconfig` (`experimentalDecorators: true`, `target: es5`, `importsNotUsedAsValues: "remove"`, an inherited `include`).
- Vite 8's `resolve.tsconfigPaths` ignores aliases when `include` comes from an extended config, which is exactly the rig setup.
- Oxc's automatic tsconfig lookup applies no tsconfig at all for rig projects (an upstream resolver bug about inherited `include`), so legacy decorators reached the browser untransformed and class fields behaved differently from `tsc`. Pointing Vite at the project's tsconfig instead makes Oxc keep type-only imports because of `importsNotUsedAsValues: "remove"`.
- Webpack tolerates `export { IProps } from './IProps'` for an interface; native ES modules fail on it at link time.

## Decision

- **Own tsconfig-paths resolver**: the project model reads `paths` / `baseUrl` through the whole `extends` chain and an early resolver tries candidates in `tsc`'s order (exact key, longest wildcard, targets in order, `baseUrl`, `node_modules`).
- **Compiler-option whitelist to Oxc**: only `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict` and `strictNullChecks` are passed as an inline tsconfig; never `jsx`, `importsNotUsedAsValues` or `preserveValueImports`, and never the tsconfig file itself, so Oxc's lookup stays off. Changing one of these options restarts the server.
- **Type re-export guard warns instead of failing**: type-only re-exports without `type`, and imports kept only for decorator metadata, are checked against the target module's runtime exports, removed from the served code and reported with the `export type` / `import type` fix (re-exports as errors in the terminal and console, metadata imports as warnings). The page keeps working.
- **`const enum`**: exported `const enum` in project `.ts` files works; ambient, `.d.ts`-only and dependency `const enum`s are not supported, and each form gets a message naming the enum, file or missing export.
- Relative and explicit-alias `require()` calls in project source are rewritten to imports; other `require()` calls are left alone.

## Rationale

- With the whitelist, decorators and class-field semantics match heft exactly (verified by running `tsc` and Oxc output side by side), and the explicit options protect projects when the upstream lookup bug is fixed (automatic lookup would then break type imports for every SPFx project).
- An own resolver is the only way to honor rig-extended configs exactly like `tsc`.
- Removing and reporting type-only names keeps the developer moving (production `tsc` removes them anyway) while still teaching the portable fix; failing the page would block work for something heft accepts.
- `const enum` from declarations cannot be inlined without whole-program compilation, so a clear explanation beats a cryptic browser error.

## Consequences

- No other compiler option changes emitted code; nothing else is downleveled.
- With `emitDecoratorMetadata`, class tokens match `tsc`, but primitive metadata can differ, and cross-module types should use `import type`.
- Only project modules are checked or rewritten; dependencies are served as published.

## Links

- [TypeScript source compatibility](../features/typescript-compatibility.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Match heft behavior for serve configurations and the debug URL](match-heft-serve-behavior.md)

## Evidence

- Source: tsconfig and decorators research (tsc vs Oxc outputs), user decisions recorded in the project handoff notes, implementation behavior (aliases and transforms components)
- Confidence: high
- Last checked: 2026-11-18
