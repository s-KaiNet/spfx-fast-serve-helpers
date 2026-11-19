---
title: TypeScript and tsconfig
type: feature
status: current
tags:
  - project-kb
  - typescript
  - tsconfig
  - decorators
  - const-enum
---

# TypeScript and tsconfig

## Summary

SWC compiles each TypeScript file on its own, with the options that change emitted code taken from the project's tsconfig chain (including the SPFx rig): decorators, decorator metadata and class-field semantics behave like heft's `tsc`. tsconfig `paths`/`baseUrl` resolve imports in project code. webpack semantics make type-only re-exports and decorator-metadata type imports harmless at runtime, so fast-serve only hides the resulting warnings; `const enum`s that exist only in declarations can't work per file and get explicit compile errors. No type checking.

## Behavior

### Compiler options

- Read through `extends` (relative paths and packages, so the rig's `tsconfig-base.json` counts).
- `experimentalDecorators: true` → legacy decorators (class, method, property, parameter); without it TypeScript 5 standard decorators (SWC `2022-03`).
- `emitDecoratorMetadata` (with legacy decorators) → `design:type`/`design:paramtypes`/`design:returntype` metadata through `Reflect.metadata` when present.
- `useDefineForClassFields`: the explicit value, else tsc's default from `target` (true from ES2022/ESNext). The rig's `target: es5` gives `false`, so a field without an initializer is not emitted and doesn't reset a value set by a base class, as with heft.
- Nothing is downleveled beyond ES2020; `target` only decides the class-field default. JSX is the classic React transform. A tsconfig change needs a restart for now.

### `paths` and `baseUrl`

- Rspack's built-in tsconfig resolver (`resolve.tsConfig`, a port of `tsconfig-paths-webpack-plugin`) handles the project's `tsconfig.json`, scoped to modules of the project (not `node_modules`). It follows a rig-style `extends` whose `include` comes from the extended file, which was the gap in Vite's resolver. Every request from a project script goes through it, so aliased assets and styles resolve as well.
- heft itself bundles `tsc` output, which keeps aliased specifiers, so a heft build needs its own webpack alias for them; fast-serve resolves them without one (same as the Vite implementation).

### Type-only names

- `export { IProps } from './IProps'` (an interface re-exported without `type`) and a decorator-metadata reference to an imported interface stay in SWC's output. Under webpack semantics they are harmless: the missing export is `undefined` and metadata falls back to `Object` (SWC emits `typeof X === "undefined" ? Object : X`, like tsc).
- Rspack reports them as `export 'X' (reexported as 'X') was not found` warnings. fast-serve drops those warnings when both modules are project files and the target declares `X` only as an `interface` or `type`. Any other missing export (a typo, a real value, a dependency's name) keeps the warning.
- A plain `typeof X` use of a missing import produces no warning (webpack rule).

### `const enum`

- A `const enum` in a project `.ts` file works (SWC emits it as an object; imports from other files work).
- A global `declare const enum` from a project `.d.ts`, used as a value, would be a `ReferenceError` in the browser: a compile error names the file, the enum and its `.d.ts` and suggests a regular `enum` (shown in the overlay and terminal). The `.d.ts` files of `src` are rescanned on every rebuild.
- A relative import of a module that only exists as a `.d.ts` (for example `export declare const enum`) replaces Rspack's "Module not found" with an error naming the `.d.ts` and its const enums and suggesting a `.ts` file or `import type`.
- A `const enum` from a dependency's declarations (for example Fluent's `IconNames`) has no runtime value; Rspack's "export … was not found" warning stays and the value is `undefined` (heft inlines it with tsc). Use string values.

## Links

- [Rspack compile](rspack-compile.md)
- [Project model](../architecture/project-model.md)
- [Styles, theme tokens and typings](styles-and-typings.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: integration tests with real compiles of a fixture extending a rig-style tsconfig (decorators of every kind with metadata, class field without initializer under ES5 and ES2022 targets, `paths` through `extends`, type-only re-export and metadata imports without warnings, a real missing export still warned, global `declare const enum` and declaration-only import errors); tsc's `useDefineForClassFields` default; the rig's `tsconfig-base.json`.
- Live (copy of the small test project, `1.24.0-rspack.7`): an import through a `paths` alias and a class with a legacy method decorator rendered on the SharePoint page.
- Confidence: high
- Last checked: 2026-11-19
