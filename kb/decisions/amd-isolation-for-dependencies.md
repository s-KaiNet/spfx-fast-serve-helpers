---
title: Isolate dependency code from the page's AMD define
type: decision
status: current
tags:
  - project-kb
  - decision
  - amd
  - requirejs
  - commonjs
  - pre-bundling
---

# Isolate dependency code from the page's AMD define

## Summary

Dependency code served by `fast-serve` (pre-bundled or from `node_modules`) sees `define` as `undefined`, so UMD libraries take their CommonJS or ES module branch as they do under webpack. Packages that must register with SharePoint's RequireJS opt out with `amdPackages` in `fast-serve/config.json`. Bare `require('<literal>')` in project code is rewritten with webpack's `require` semantics rather than left to RequireJS.

## Context

- On a SharePoint page the global `define` and `require` are SharePoint's RequireJS. Webpack never lets bundled code see them: it handles `require` and `define` at build time.
- Under `fast-serve` dependency code runs as ES modules in the page, so a UMD wrapper that checks `typeof define === "function" && define.amd` first (full `lodash`, older moment builds, older bundles) registers an anonymous module with RequireJS: "Mismatched anonymous define() module", and the import is `{}`. The stack points at whatever RequireJS was loading, not the culprit.
- Bare package `require()` calls in project code reached RequireJS and failed, while webpack would have bundled them.

## Decision

- Replace the global `define` with `undefined` in dependency code with Oxc's scope-aware define replacement, in pre-bundling and for files served from `node_modules`, only in files mentioning `amd`; never in project `src`.
- Opt-out per package: `amdPackages: string[]` in `fast-serve/config.json`, included in the pre-bundle cache key.
- Rewrite `require('<literal>')` in project code to imports that give webpack's values (CommonJS `module.exports`, ES namespace, raw RequireJS module for SPFx libraries and externals, data, side effect, URL); leave computed and special forms alone with one warning per file for computed names.
- Show a hint for "Mismatched anonymous define()" in the terminal and overlay even without a project frame, as an exception to the project-frame rule of [error reporting](error-reporting.md).

## Rationale

- Hiding `define` reproduces what webpack effectively does for dependencies without per-library patches; scope awareness avoids breaking local `define` identifiers, and the `amd` text filter keeps the cost near zero for ordinary modules.
- An opt-out keeps the rare package that really needs RequireJS working; making it part of the cache key avoids stale pre-bundles.
- The AMD mismatch error is never thrown from a project frame, so without the exception it would be invisible in the terminal.

## Consequences

- lodash doesn't set `window._` in dev (webpack's AMD branch did).
- Linked packages served as source outside `node_modules` aren't isolated unless pre-bundled; AMD-only files that never mention `amd` are untouched.
- A `require` placed after other statements runs before them (ES import hoisting), unlike webpack.

## Links

- [require() and AMD in dependencies](../features/require-and-amd.md)
- [TypeScript handling without tsc](typescript-handling.md)
- [Error reporting: project errors only, overlay for runtime errors](error-reporting.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Dev vs production differences](../limitations/dev-vs-production.md)

## Evidence

- Source: user docs (require and AMD section), project handoff notes, implementation behavior; accepted with the change that introduced `amdPackages`
- Confidence: high
- Last checked: 2026-11-19
