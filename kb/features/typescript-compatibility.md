---
title: TypeScript source compatibility
type: feature
status: current
tags:
  - project-kb
  - typescript
  - tsconfig
  - decorators
  - const-enum
  - transforms
---

# TypeScript source compatibility

## Summary

Code written for `heft build` (webpack + tsc) mostly runs unchanged even though Vite compiles each file on its own with Oxc and the browser loads native ES modules. `fast-serve` applies the project's tsconfig `paths`/`baseUrl` aliases and the compiler options that change emitted code, rewrites the `require()` forms SPFx code commonly uses, and turns the cases that can't work file by file (type re-exports without `type`, decorator-metadata type imports, `const enum` from `.d.ts` files or dependencies) into clear messages instead of cryptic browser errors. There is no type checking.

## Behavior

### tsconfig `paths` and `baseUrl`

- `compilerOptions.paths` and `baseUrl` from `tsconfig.json` and every file it `extends` resolve imports in project source the way `tsc` does: exact keys first, then the longest matching wildcard, targets in order (the first that exists wins), then `baseUrl`, then `node_modules`.
- Editing `tsconfig.json` or an extended file inside the project re-resolves imports and reloads the page.
- A `tsconfig.json` that can't be read is ignored with a warning.

### Compiler options that change emitted code

- `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict` and `strictNullChecks` are read through `extends` (so the SPFx rig's `experimentalDecorators: true` and `target: "es5"` apply) and applied as `tsc` applies them.
- Legacy class, method, property and parameter decorators work; a class field without an initializer is not emitted, so it doesn't reset a value set by a base class, matching heft even in code without decorators.
- Nothing else is downleveled. Changing one of these options restarts the dev server.

### `emitDecoratorMetadata` type imports

- With `emitDecoratorMetadata`, a plain `import { ILogger } from './ILogger'` used only as a parameter type stays in the compiled code and would fail in the browser. `fast-serve` removes such names when the target module doesn't export them at runtime (their metadata becomes `Object`, as with `tsc`) and warns with the `import type` fix.
- Class tokens, which DI containers use, produce the same metadata as `tsc`; metadata for primitive types (`string`, `number`) can differ.

### Type re-exports without `type`

`export { IProps } from './IProps'` works under webpack but not in native ES modules. `fast-serve` checks re-exported names against the target module's runtime exports, removes type-only ones from the served code, and reports file, line and the `export type { … }` fix in the terminal and the browser console.

### `require()` in project source

- Relative `require()` calls (`require('./logo.png')`, `require('./data.json')`, scripts, styles) and `require()` of an explicit tsconfig `paths` key (`require('@alias/logo.png')`) become hoisted imports: assets as URLs, JSON as its default export, scripts and styles as namespaces.
- A catch-all `"*"` key or `baseUrl` alone doesn't make a `require()` an alias. Other `require()` calls in project source are left alone: use `import`.

### `const enum`

- An exported `const enum` in the project's own `.ts` files works.
- A `const enum` declared only in a `.d.ts` file or in a dependency (for example `IconNames` from `@fluentui/font-icons-mdl2`) can't work: files are compiled one by one, so the enum isn't inlined and no JavaScript object exists. Use a regular `enum` or string values. `fast-serve` explains each form:
  - a global `declare const enum` from a project `.d.ts` used as a value: a message naming the enum and its `.d.ts`, in the terminal and the browser console, found while compiling the file;
  - an import of a module that exists only as a `.d.ts`: the compile error names the `.d.ts` and its const enums instead of `Failed to resolve import`;
  - a named import a dependency doesn't export at runtime (a `const enum` or a type): the browser's "does not provide an export named" error, found when the page links modules, is shown in the web part, console and terminal with the fix.

### Defines and checks

- `DEBUG` is `true` and `process.env.NODE_ENV` is `"development"`.
- No type checking and no linting: run `tsc --noEmit`, ESLint or `heft build` separately.

## Implementation Notes

- The aliases component is an early resolver that tries the candidates the project model derives from the merged tsconfig chain; Vite 8's built-in `resolve.tsconfigPaths` is not used because it ignores aliases when `include` comes from an extended config, which is the SPFx rig setup.
- Compiler options are passed to Oxc as an inline tsconfig whitelist; Oxc's own tsconfig lookup stays off, because the rig's `importsNotUsedAsValues: "remove"` would keep type-only imports.
- Only project modules are checked or rewritten; dependencies are served as published. See [Source pipeline](../architecture/source-pipeline.md).

## Edge Cases

- Assets imported through a `paths` alias need the typings folder as a second alias target to be typed (see [Styles, theme tokens and asset typings](styles-and-assets.md)).
- The type-only checks only see names the target module doesn't export at runtime; a real runtime export with the same name is kept.
- Chrome may report an earlier column than the failing expression on the same line (for example inside JSX children).

## Links

- [Source pipeline](../architecture/source-pipeline.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [Styles, theme tokens and asset typings](styles-and-assets.md)
- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [TypeScript handling without tsc](../decisions/typescript-handling.md)
- [TypeScript limits of per-file compilation](../limitations/typescript-limits.md)

## Evidence

- Source: user docs, migration guide, tsconfig/decorators research, implementation behavior (aliases and transforms components, bundle shim)
- Confidence: high
- Last checked: 2026-11-18
