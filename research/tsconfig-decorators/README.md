# Research: tsconfig, legacy decorators, class fields and `const enum` under fast-serve

> Experiment files, logs and captures referenced here were removed from the repo in a cleanup; they are in git history at commit `dd4da8d`.

Date: 2026-11-17. Discovery only; nothing in `src/` was changed. Vite 8.3.8 (Oxc transform), SPFx 1.24.1, Chrome 153.
The experiment files are in `experiment/` (runner, probes, fixtures, tsc vs Oxc outputs).

## Summary

- **fast-serve ignores the project's tsconfig today.** As a result:
  - legacy decorators reach the browser untransformed (SyntaxError; Chrome 153 has no native decorators);
  - class fields behave differently from heft, even in code without decorators.
- **Fix:** read the project's tsconfig ourselves (resolving `extends`) and pass a whitelist of compiler options to Vite (`oxc.tsconfig`). With it, decorators and class fields behave exactly as under heft.
- `emitDecoratorMetadata` works for class tokens, with two limits (below).
- `const enum` declared only in `.d.ts` files (own or a dependency's) cannot work when each file is compiled separately: detect it, show a clear error, and document it.

## Why the tsconfig isn't applied

- SPFx 1.24's base tsconfig (`@microsoft/spfx-web-build-rig/profiles/default/tsconfig-base.json`) sets:
  - `experimentalDecorators: true`, `target: es5`, `strict: true`, `importsNotUsedAsValues: "remove"`;
  - no `emitDecoratorMetadata`, `useDefineForClassFields` or `isolatedModules`, so tsc assigns class fields in the constructor.
- **Automatic lookup fails.** Vite 8 lets Oxc find the nearest tsconfig. Oxc resolves the base's inherited `include` (`../../../../../src/**/*.ts`) against the project's tsconfig instead of the base file. It then decides `src/**` isn't covered and applies no tsconfig (`tsconfigFilePaths: []`). Upstream bug: oxc-project/oxc-resolver#1357, fix proposed in PR #1358.
- **Pointing Vite at the tsconfig breaks type imports.** With Vite's `tsconfig: '<root>/tsconfig.json'`, SPFx's `importsNotUsedAsValues: "remove"` makes Oxc keep type-only imports (e.g. `import { IReadonlyTheme } from '@microsoft/sp-component-base'` in `HelloWorldWebPart`), which fail in the browser. `verbatimModuleSyntax: false` cancels it. No upstream issue found.
- **Risk:** once #1357 is fixed, every SPFx project gets automatic tsconfig lookup and hits the type-import break. Passing options explicitly turns the automatic lookup off, so we're protected.

## Decorators and class fields

| Case | tsc (heft) | fast-serve today | With the fix |
|---|---|---|---|
| Class decorator (replaces the class) | `__decorate`, `tag:"T1"` | sent as is → SyntaxError | `_decorate(...)`, same result |
| Method decorator (changes `descriptor`) | works, logs `call:add` | SyntaxError | same as tsc |
| Property decorator (accessor on the prototype) | field goes through the setter; `titleOwn:false` | SyntaxError; even once transformed, a `title = …` field would hide the accessor | same as tsc |
| Parameter decorator | `__param` | SyntaxError | `_decorateParam`, same call order |
| Field without initializer, no decorators | not emitted; subclass sees `declared:"from-base"` | `declared;` emitted, resets to `undefined` | same as tsc |
| `@override` | not in `@microsoft/sp-core-library` 1.24; `@microsoft/decorators` not installed | — | nothing to support |

- tsc output and the fixed Oxc output were run as native ESM in Node; the logged results were identical.
- The decorator helpers come from `@oxc-project/runtime`, which Vite serves itself; no extra dependency.
- On the real server with the fix: type imports are still removed; plugin-react's JSX runtime and Fast Refresh still work.

## emitDecoratorMetadata (fix + `emitDecoratorMetadata: true`)

| Type | tsc | Oxc |
|---|---|---|
| Local or imported class | class | class (`typeof X === "undefined" ? Object : X`) |
| Local interface | `Object` | `Object` |
| Interface or type alias from another module, imported without `type` | `Object`, import removed | **import kept** → `SyntaxError: does not provide an export named 'ILogger'` (no fast-serve warning today) |
| Primitives | differ from tsc | differ |
| Class imported with `import type` | `Function` | `Object` |

Class tokens are correct, which is what DI containers (tsyringe, inversify) need. Primitive metadata differs, which matters for libraries like class-validator. Checked with `reflect-metadata` in a /tmp copy.

## const enum

| Case | tsc | fast-serve | Fixable by config? |
|---|---|---|---|
| `export const enum` in a `.ts` file, imported elsewhere | inlined | works (real enum object, not inlined) | n/a |
| Re-exported (`export {}` / `export *`) | inlined | works | n/a |
| Local `const enum` | inlined | works | n/a |
| Global `declare const enum` in own `.d.ts` | inlined `20` | `ReferenceError: GlobalLevel is not defined` | no |
| `export declare const enum` in a `.d.ts` module | inlined `7` | Vite: `Failed to resolve import "./moduleTypes"` | no |
| From a dependency: `IconNames` in `@fluentui/font-icons-mdl2` (JS is `export {}`) | inlined `"Add"` | pre-bundled dep exports only `initializeIcons` → SyntaxError, missing export | no |

## Config

Read the tsconfig (resolving `extends`) and pass only this whitelist:

```ts
oxc: {
  tsconfig: {
    compilerOptions: {
      experimentalDecorators,
      emitDecoratorMetadata,
      useDefineForClassFields,
      target,
      strict,
      strictNullChecks,
    },
  },
}
```

- Don't pass `jsx`, `importsNotUsedAsValues` or `preserveValueImports`.
- For a default SPFx project: `{ experimentalDecorators: true, strict: true, target: 'es5' }`.
- Vite merges it with plugin-react's `oxc.jsx`.
- `target: 'es5'` only switches fields to assignment; nothing else is downlevelled (checked async functions, `?.`, `??`, `#private`).
- Equivalent without a tsconfig object (checked with a direct transform test only): `oxc: { decorator: { legacy: true, emitDecoratorMetadata }, typescript: { removeClassFieldsWithoutInitializer: true }, assumptions: { setPublicClassFields: true } }`.

## Recommendation

- **Support legacy decorators through the config above**, in a small module (e.g. `transforms/tsconfig`). It matches heft for decorators and fields, fixes field semantics for every project, and protects against the #1357 change. Treat it as a P0 bug fix.
- **emitDecoratorMetadata:** pass it through when set. Document that cross-module interfaces/types must use `import type`, and that primitive metadata differs. Later: extend the type-reexport guard to report kept type imports clearly.
- **const enum:** don't support ambient / `.d.ts` / dependency cases. Show a clear error (unresolved `.d.ts` import, missing export from a dependency, ReferenceError naming an ambient enum) and document "use a regular `enum`". Exported `const enum` in project `.ts` files already works.

## Experiment files

- `experiment/fixture-src/`: the test sources (decorators, field cases, enums, metadata).
- `experiment/tsc-out/`, `experiment/vite-out/`: tsc output and the module as served by Vite.
- `experiment/run/{tsc,oxcToday,oxcFixed}/`: the outputs run in Node; `runner.mjs` runs them.
- `experiment/probe*.mjs`: direct Oxc transform probes; `elide/run.mjs`: the type-import test.
- `experiment/v-*`: tsconfig discovery variants (plain, with include, extends into spfx-rea, nested base).
- `experiment/serve-exp.mjs`: fast-serve plus an extra Vite config, with modes `none`, `tsconfig`, `raw`, `oxc`.
- Paths inside the scripts point to `/tmp/deco-exp` and `/home/sergei/Projects/spfx-rea`.
