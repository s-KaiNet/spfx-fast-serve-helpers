---
title: require() and AMD in dependencies
type: feature
status: current
tags:
  - project-kb
  - require
  - commonjs
  - amd
  - requirejs
  - transforms
  - pre-bundling
---

# require() and AMD in dependencies

## Summary

On a SharePoint page the global `require` and `define` belong to SharePoint's RequireJS. Heft's webpack handles both at build time; `fast-serve` serves native ES modules, so it reproduces webpack's handling in two places. A `require('<string>')` in project code becomes an import that gives what webpack's `require` would give. Dependency code (pre-bundled or served from `node_modules`) doesn't see the page's global `define`, so UMD libraries that check for AMD first take their CommonJS or ES module branch, as under webpack. Packages that really must register with SharePoint's RequireJS opt out through `amdPackages` in `fast-serve/config.json`.

## Behavior

### `require('<literal>')` in project code

A `require()` call whose argument is a string literal (or a template literal without expressions) becomes an import, and the call expression is replaced by what webpack's `require` returns:

| Required module | Value of the call |
|---|---|
| relative path or explicit tsconfig `paths` key: script or style | the module namespace |
| relative path or alias: `.json` | the parsed data |
| relative path or alias: other file (image, font, …) | the asset's dev server URL |
| package, CommonJS (`require('dayjs')`, a deep path into a package) | its `module.exports` |
| package, ES module | its namespace |
| SPFx library (`@microsoft/sp-*`, other SPFx library packages) or `config/config.json` external | the module exactly as SharePoint's RequireJS returns it |
| package `.json` (`require('pkg/data.json')`) | the data |
| package style file | imported for its side effect |
| package asset (`require('pkg/icon.svg')`) | a URL |

- `require('x');` as a statement simply runs the module for its side effects.
- The generated imports are placed after the file's own imports, so the evaluation order among dependencies stays the same as under webpack. The same specifier required several times uses one import.
- A catch-all `"*"` `paths` key or `baseUrl` alone doesn't make a specifier an alias; such a specifier is treated as a package.

### What is left alone

- A computed `require(name)`: it reaches SharePoint's RequireJS and fails with `Module name "x" has not been loaded yet for context: _`. The terminal prints one warning per file suggesting a string literal or `import()` for modules chosen at runtime.
- `require.resolve`, `require.context`, `require.ensure`, `typeof require`, and a `require` that is a parameter or variable of the project's own code (a shadowed `require`).
- Dependency code: only project modules are rewritten; Vite's pre-bundling already converts CommonJS dependencies.

### AMD isolation for dependency code

- UMD libraries that test for AMD before CommonJS (the full `lodash` build, some older moment builds, bundles from older tooling) would otherwise call SharePoint's `define()` from dependency code: RequireJS throws "Mismatched anonymous define() module" with a stack pointing at an unrelated module, and the import gives `{}`.
- `fast-serve` replaces the global `define` with `undefined` in dependency code, both in pre-bundled dependencies and in JavaScript files served from `node_modules`. The replacement is scope-aware, so a local variable or parameter named `define` is untouched, and it runs only on files that mention `amd` (the UMD detection `define.amd`).
- Project `src` code and `config/config.json` externals keep seeing RequireJS.
- **Opt-out**: `"amdPackages": ["package-name"]` in `fast-serve/config.json` keeps the page's `define` for the listed `node_modules` packages (scoped names like `@scope/pkg` work). The list is part of the pre-bundle cache key, so changing it re-bundles dependencies; restart `fast-serve` after changing it.
- If "Mismatched anonymous define()" still appears, it reaches the terminal and the overlay with a hint even when no project frame is in the stack: look for a package listed in `amdPackages`, a linked package outside `node_modules`, or an AMD script loaded with a `<script>` tag.

## Implementation Notes

- Packages are unwrapped by a small inline helper: an ES module namespace or an object with `__esModule` is returned as is, otherwise the interop `default` (which is `module.exports`). This is needed because Vite 8 turns a namespace import of a pre-bundled CommonJS dependency into a copy, not `module.exports` (see [Vite 8, Oxc and Rolldown facts relied upon](../references/vite-oxc-rolldown.md)).
- SPFx libraries and externals use the facades' raw-module export, the same mechanism as webpack-like external imports (see [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)).
- AMD isolation is one transform registered both in Vite's request pipeline (for served `node_modules` files, skipping already pre-bundled output) and as a Rolldown plugin in pre-bundling, with id and code hook filters so unrelated modules cost nothing. See [Source pipeline](../architecture/source-pipeline.md).

## Edge Cases

- ES module hoisting: imports run before the module body, so a `require` placed after other statements runs before them, while webpack runs it in place. Code that sets a global before requiring a module that reads it must be reordered or use `import()`.
- Under webpack lodash's AMD branch also sets `window._`; with the CommonJS branch under `fast-serve` it doesn't. Code relying on the global `_` must import lodash.
- A linked package served as source outside `node_modules` isn't isolated unless it is pre-bundled.
- An AMD-only file that never mentions `amd` is left untouched.

## Links

- [TypeScript source compatibility](typescript-compatibility.md)
- [CLI, options and startup](cli-and-options.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [SPFx library imports and config.json externals](library-imports-and-externals.md)
- [Isolate dependency code from the page's AMD define](../decisions/amd-isolation-for-dependencies.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Dev vs production differences](../limitations/dev-vs-production.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)

## Evidence

- Source: user docs (require and AMD section, options, troubleshooting), migration guide, project handoff notes (transforms, Vite 8 facts), implementation behavior (require rewriting, AMD isolation, browser-errors and options components); found while serving real projects
- Confidence: high
- Last checked: 2026-11-19
