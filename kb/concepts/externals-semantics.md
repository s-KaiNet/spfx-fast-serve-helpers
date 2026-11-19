---
title: Externals semantics
type: concept
status: current
tags:
  - project-kb
  - spfx
  - externals
  - amd
  - webpack
---

# Externals semantics

## Summary

In SPFx, framework libraries, `config.json` externals and localized resources are never bundled: the bundle declares them as dependencies of its AMD `define`, sp-loader resolves them through the component's manifest, and the bundle reads values from the loaded modules at runtime. Because Rspack implements webpack's external-module semantics, an Rspack bundle with AMD externals behaves like heft's output without any of the import rewriting the Vite implementation needed.

## Current Knowledge

### What is external

- Every dependency that ships an SPFx library manifest (all `@microsoft/sp-*` packages, `@microsoft/sp-adaptive-card-extension-base`, third-party library components), plus `react`, `react-dom`, `react-dom/client` and `@microsoft/microsoft-graph-client` in heft's production config, plus `config.json` `localizedResources` and `externals` keys.
- `tslib` and `@microsoft/load-themed-styles` are bundled.
- `fast-serve` deliberately bundles the project's development React instead of using the page's production React (Fast Refresh needs the development build and a React it can instrument).

### How an AMD external behaves

- The external's specifier appears in the bundle's `define([...], factory)` dependency list; RequireJS passes the loaded module object to the factory before any bundle code runs.
- A named import (`import { Version } from '@microsoft/sp-core-library'`) compiles to a property read on that module object **at the point of use**, so a name that the module defines later or not at all yields `undefined` instead of a link error.
- `import * as x` gives the module object as RequireJS returned it, so a function or class exported as the whole module stays callable/constructible.
- A default import reads `module.default` when the module sets `__esModule`, otherwise it is the module itself.
- `export * from '<external>'` is a dynamic re-export in webpack's output (names copied at runtime).
- `require('<external>')` returns the raw module object.

### Manifest side

- SPFx library externals become `scriptResources` entries of type `component` (`id`, `version` of the installed library); the tenant serves the highest version with the same major that is ≥ the requested one.
- `config.json` externals become entries of type `path` (`path`, optional `globalName`, `globalDependencies`): URLs as is, local files served from the bundle's base URL; `globalName` turns into a RequireJS `shim` so non-AMD scripts work.
- Every name in the `define` dependency list must be resolvable through the component's `scriptResources`, otherwise RequireJS tries to load it as a relative URL and fails.

### Lessons from the Vite implementation

- The Vite implementation served ES modules, so it emulated these rules (top-level-await facades over `loadComponentById`, rewriting named imports to property reads, raw module for `require`). With Rspack the same results come from webpack semantics; only regression tests are needed.

## Links

- [Component manifests and the SharePoint loader](component-manifests-and-loader.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [Architecture overview](../architecture/overview.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: heft's generated webpack config and production bundles for SPFx 1.24.1, the Rspack prototype (`externalsType: 'amd'` output and AMD dependency lists identical to heft's), the Vite implementation's externals research
- Confidence: high for heft behaviour and the AMD dependency list; medium for `export *` from an external under Rspack (not yet tested)
- Last checked: 2026-11-19
