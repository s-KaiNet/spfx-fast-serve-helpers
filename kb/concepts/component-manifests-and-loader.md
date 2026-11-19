---
title: Component manifests and the SharePoint loader
type: concept
status: current
tags:
  - project-kb
  - spfx
  - sp-loader
  - requirejs
  - manifests
---

# Component manifests and the SharePoint loader

## Summary

SharePoint never sees a project's source or build tool; it only reads component manifests and loads the scripts they point to through sp-loader and RequireJS. A manifest names the component, its bundle and every dependency (`scriptResources`). Framework libraries (`@microsoft/sp-*`, React) are always taken from the page in the tenant's own version. This contract is what `fast-serve` must reproduce.

## Current Knowledge

### Bundles and components

- `config/config.json` lists **bundles**; each bundle has one or more **components** (each with a source `*.manifest.json` and an entry module). It also holds `localizedResources` and optional `externals`.
- Every component has a GUID `id` and a `version`; `"version": "*"` in the source manifest means the `package.json` version (pre-release stripped).
- A component's **module id** is `<id>_<version>`, for example `2997f152-…_0.0.1`. RequireJS registers the bundle under that id.

### Component manifest

The emitted manifest carries the source manifest fields (`componentType`, `alias`, `preconfiguredEntries`, `supportedHosts`, …) plus `loaderConfig`:

- `internalModuleBaseUrls`: where the bundle's files live (`https://localhost:4321/dist/` in debug, the CDN/app-catalog location in release).
- `entryModuleId`: the bundle name; it is also a key in `scriptResources`.
- `exportName`: set when a bundle holds several components; the loader takes that property of the module instead of `default`.
- `scriptResources`: one entry per bare specifier the bundle imports:

| Type | Fields | Meaning |
|---|---|---|
| `path` | `path`, optional `globalName`, `globalDependencies` | a file under the base URL: the entry bundle, a localized-strings file, or a legacy non-AMD script (`config.json` `externals`) |
| `localizedPath` | `paths` per locale, `defaultPath` | the loader picks a file by the page's UI culture |
| `component` | `id`, `version` | another SPFx component (framework library, React, a library component), resolved through the manifest store |

- Localized manifest strings use `{ "id": "$<loc file>:<key>;" }`; heft resolves them at build time.
- The component class is the module's `default` export (or the `exportName` property). sp-webpart-base instantiates it, calls `onInit()` and `render()`.

### `manifests.js`

- `/temp/build/manifests.js` is an AMD module (no name) whose value has `getManifests()` returning debug manifests with absolute base URLs.
- heft lists the project's components plus every SPFx package found in `node_modules`; on a real SharePoint page the framework manifests are dropped anyway, so only the project's own manifests matter. `fast-serve` renders only the project's own manifests.

### sp-loader and RequireJS

- sp-loader (part of the page) creates RequireJS 2.3.7 and translates a manifest into RequireJS configuration when a component loads:
  - `paths["<id>_<version>"]` = base URL + entry path; other `path` resources get ids `<id>_<version>/<name>`;
  - `map["<id>_<version>"]` maps each bare specifier to the module id of the resolved dependency (`react` → `<reactId>_18.3.1`, `@microsoft/sp-core-library` → `<id>_1.25.0`);
  - `globalName` resources become RequireJS `shim` entries.
- Because `map` is per component, the same specifier can resolve differently for different components. A bundle script must be a **classic script** that calls `define(...)` synchronously; RequireJS loads it with a `<script>` tag.
- `SPComponentLoader.loadComponentById(id, version)` (from `@microsoft/sp-loader`) loads any SPFx component by id at runtime. The Vite implementation needed it for on-demand library facades; with AMD bundles the libraries are plain `define` dependencies, as in heft.
- Unknown manifests are fetched from `/_api/web/GetClientSideComponents`.

### Version resolution: the tenant serves the framework

- The manifest store picks the highest stored version with the **same major and ≥ the requested version**; once a debug manifest qualifies, it wins over deployed ones.
- Framework packages and React therefore always come from the page in the tenant's version. A project built on 1.24.1 runs against a tenant serving 1.25.0 — that is normal and identical to production.
- A project that needs a **newer** library than the tenant has fails with `Cannot find manifest for <id>_<version>. Store had [...]`, in production too. The Vite implementation reported this as a clear "older than … used by the project" message; the Rspack implementation should do the same.

### SPFx libraries as externals

- heft treats as externals (never bundled): every dependency that ships an SPFx library manifest (`dist/<guid>.manifest.json`: all `@microsoft/sp-*` packages, `@microsoft/sp-adaptive-card-extension-base`, built library components), plus `react`, `react-dom`, `react-dom/client` and `@microsoft/microsoft-graph-client` with fixed component ids, plus the `localizedResources` keys and `config.json` `externals`.
- Shared singletons (service scope, page context, React for the framework) only work when they come from the page.
- `tslib` and `@microsoft/load-themed-styles` are bundled, not externals.
- In `fast-serve`, React is the exception: the page's framework uses the tenant's production React, while the project's own code bundles the development React from `node_modules` (needed for Fast Refresh).
- `config.json` `externals` (legacy scripts by URL or local file, with optional `globalName`/`globalDependencies`) are loaded by SharePoint's RequireJS in both heft and `fast-serve`, never bundled from `node_modules`.

## Links

- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [SharePoint debug flow](sharepoint-debug-flow.md)
- [SPFx component types](spfx-component-types.md)
- [Externals semantics](externals-semantics.md)
- [Architecture overview](../architecture/overview.md)

## Evidence

- Source: research (emitted manifests, `manifests.js`, live RequireJS configuration snapshot, shipped sp-loader 1.24.1 code; tenant served SPFx 1.25.0 to 1.24.1 projects), carried over from the Vite implementation's KB
- Confidence: high
- Last checked: 2026-11-19
