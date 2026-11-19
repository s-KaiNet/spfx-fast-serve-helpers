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
---

# require() and AMD in dependencies

## Summary

On a SharePoint page the global `require` and `define` belong to SharePoint's RequireJS. Rspack resolves `require('<literal>')` at build time and handles `define`/UMD wrappers in bundled code itself, exactly like heft's webpack, so neither reaches the page's RequireJS. Nothing is emulated: the Vite implementation's `require()` rewriting, AMD isolation, `amdPackages` option and "Mismatched anonymous define()" hint have no counterpart here. Regression tests guard the behaviour, including the `amd: {}` setting Rspack 2 needs for AMD parsing.

## Behavior

| Code | Result (same as heft) |
|---|---|
| `require('cjs-package')` | its `module.exports` (a function stays callable) |
| `require('esm-package')` | the module namespace |
| `require('./data.json')` | the parsed data |
| `require('./logo.png')` | the asset's dev-server URL |
| `require('side-effect-package');` | runs the module |
| `require('@microsoft/sp-core-library')`, or a CommonJS dependency requiring an SPFx library or a `config.json` external | stays an AMD external on the bundle's `define`; the value is the module SharePoint's loader supplies |
| UMD dependency that checks `define.amd` first (full `lodash`, older moment builds, bundles from older tooling) | its AMD branch runs against webpack's own `define`; the page's `define` is called once, by the bundle wrapper |
| full `lodash` | works; `import * as _` and `require('lodash')` give the same object, and `window._` is set by lodash's AMD branch (as with heft) |

- `amdPackages` in `fast-serve/config.json` is ignored with a warning (see [CLI, options and startup](cli-and-options.md)).

## Links

- [Rspack compile](rspack-compile.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: integration test compiling a fixture with all cases above and evaluating it with a page `define` that has `define.amd` and throws "Mismatched anonymous define()" on a second call (the suite fails with `amd: false`); live on SharePoint Online (spfx-rea copy, 2026-11-19): a component importing `chunk` and `VERSION` from `lodash` rendered `lodash 4.18.1: [[1,2],[3]]`, `window._` was lodash, no console errors.
- Confidence: high
- Last checked: 2026-11-19
