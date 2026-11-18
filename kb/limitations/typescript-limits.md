---
title: TypeScript limits of per-file compilation
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - typescript
  - const-enum
  - decorators
---

# TypeScript limits of per-file compilation

## Summary

Vite compiles each file on its own with Oxc, without type information, and the browser links native ES modules strictly. A few TypeScript patterns that work under `heft build` (tsc + webpack) therefore can't work or need a small source change: `const enum` declared only in `.d.ts` files or dependencies, type imports kept by `emitDecoratorMetadata`, type re-exports without `type`, and non-alias `require()` calls. `fast-serve` explains each case with a clear message instead of the browser's cryptic error.

## Current Knowledge

| Pattern | Why it fails in dev | What `fast-serve` does | Fix in source | Severity |
|---|---|---|---|---|
| `const enum` declared only in a `.d.ts` file or a dependency (for example `IconNames` from `@fluentui/font-icons-mdl2`) | per-file compilation can't inline the enum, and there is no JavaScript object to import | global `declare const enum` from a `.d.ts` in `src`: names the enum and its `.d.ts` (terminal and browser console, at compile time); import of a module that exists only as a `.d.ts`: the compile error names it and its const enums instead of `Failed to resolve import`; a named import a dependency doesn't export at runtime: the web part, console and terminal show the browser's "does not provide an export named" error with the fix, found only when the page links modules | use a regular `enum` or string values; an exported `const enum` in the project's own `.ts` files works | medium (cannot be solved file by file) |
| `emitDecoratorMetadata` with a plain `import { ILogger }` used only as a parameter type | Oxc keeps the import because decorator metadata references it; the target module has no runtime export | removes such names from the served code when the target doesn't export them (metadata becomes `Object`, as with `tsc`) and warns with the `import type` fix | `import type` for interfaces and types | low |
| Decorator metadata for primitive types | no type information per file | — | class tokens (what DI containers use) match `tsc`; don't rely on metadata for `string`, `number`, … | low |
| Type re-exports without `type` (`export { IProps } from './IProps'`, or an imported type exported again) | webpack tolerates them; native ES modules fail to link | removes the re-export and reports it as an error with the location | `export type { IProps }` | low |
| `require()` in `src` other than relative paths or explicit tsconfig `paths` aliases | no CommonJS in native ES modules | only relative and explicit-alias `require()` calls are rewritten to imports (a catch-all `"*"` key or `baseUrl` alone doesn't count) | use `import` | low |
| Compiler options beyond the applied set | only `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict`, `strictNullChecks` change emitted code | nothing else is downleveled | — | low |
| Type errors | no type checking | none | `tsc --noEmit` or `heft build` | medium |

## Links

- [TypeScript source compatibility](../features/typescript-compatibility.md)
- [TypeScript handling without tsc](../decisions/typescript-handling.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Dev vs production differences](dev-vs-production.md)

## Evidence

- Source: user docs (limitations, migration), tsconfig/decorators research, implementation behavior (transforms and bundle shim)
- Confidence: high
- Last checked: 2026-11-18
