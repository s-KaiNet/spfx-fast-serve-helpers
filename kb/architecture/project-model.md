---
title: Project model
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - project-model
  - spfx
---

# Project model

## Summary

The project model is the plain-Node layer that reads every SPFx fact fast-serve needs from the project on disk: bundles and components, manifests, serve configurations, SPFx libraries, `config.json` externals, localized resources, the tsconfig chain and the merged `config/sass.json`. It never imports Rspack and reads each fact once per model; a project change builds a new model. It is carried over from the Vite implementation, where it was already bundler-free; a snapshot of two real projects matches heft's own output.

## Current Knowledge

### Facts

| Fact | Source and rules |
|---|---|
| package | `package.json` `name`, `version` (required), dependencies |
| bundles and components | `config/config.json` `bundles`; each component needs `manifest` and `entrypoint`, else it is skipped with a warning. The entry `./lib/**.js` maps to `src/**` with `.ts`, `.tsx`, `.js`, `.jsx` tried in order; a missing source is fatal. Web parts, extensions, ACEs, Copilot components and the project's own `Library` component are supported, all through the same bundle path (a library-only project is served like any other); `Application`, `Prefab` and unknown types are skipped with a warning that their bundle is not built or listed. A project without any supported component stops with "No web parts, extensions, Adaptive Card Extensions, Copilot components or library components found" |
| manifests | source `*.manifest.json` read as JSON with comments; `id` and `componentType` required, an `Extension` needs `extensionType`; `alias` defaults to the id; version `*` or none becomes the `package.json` version |
| export names | in a bundle with several components (deduplicated by id), each gets `a`, `b`, `c`… in order, skipping JavaScript reserved words, counting skipped unsupported components like SPFx does; single-component bundles have none |
| serve configuration | `config/serve.json` `port`, `initialPage`, `serveConfigurations` (`pageUrl`, `customActions` with `location`, `fieldCustomizers` with `id`, `formCustomizer` object, optional `properties`); a malformed entry is fatal and names its path |
| SPFx libraries | packages reached transitively through dependencies that ship exactly one `dist/*.manifest.json` (or a library plus its root component); keyed by package name with id, version and folder; the project itself is excluded; linked library projects are not in this list unless listed in `deployedLibraries` (then id/version from the built manifest or the source manifest). Also `@microsoft/microsoft-graph-client` when installed, with heft's fixed component id and the installed version without prerelease suffix |
| local library projects | dependencies (transitively, also through linked libraries) whose real path is outside `node_modules` and whose `config/config.json` has a `Library` component, minus `fast-serve/config.json` `deployedLibraries`; each gets the model run on its own root in the library role (entry source, loc, tsconfig, externals; only `package.json`, `config/config.json`, the Library manifest, tsconfig chain and local externals as model files), see [local library projects](../features/local-library-projects.md) |
| code roots | the project itself (labelled "the project") followed by each local library project (labelled with its package name), each with its root, `src` folder and model; every feature that treats code of several projects alike (TypeScript rules, Fast Refresh include, localized resources, deep-import warnings, browser-error frames, compile-problem paths and the changed-file list, the startup summary) reads this one list |
| `config.json` externals | string or `{ path, globalName?, globalDependencies? }`; URLs kept, local paths resolved from the project root (`lib/` → `src/`); SPFx libraries win over an external of the same name; missing files, bad shapes and missing or circular global dependencies are skipped with a warning; local libraries' externals are merged in (the project's win on a name clash) |
| localized resources | `localizedResources` patterns with `{locale}`; `lib/` paths map to `src/` (`.js`, then `.ts`), other paths (packages) stay; a missing locale falls back to `en-us` with a warning |
| tsconfig | `tsconfig.json` and its `extends` chain (relative files, packages, rigs, arrays) merged in order; path mappings and `baseUrl` resolved relative to the declaring file; an unreadable chain is ignored with a warning |
| Sass configuration | `config/sass.json` loaded through heft's own configuration loader and the project's rig (`@rushstack/heft-config-file`, `@rushstack/rig-package`, the heft Sass plugin's schema, all from the project), so `extends` and appended arrays such as `silenceDeprecations` behave like heft; the fields used are the typings settings, `silenceDeprecations`, `ignoreDeprecationsInDependencies`, `loadPaths`, and `cssOutputFolders`/`doNotTrimOriginalFileExtension`/`sourceMap` for heft's class-name hash |
| SPFx version | installed `@microsoft/sp-core-library`, then `@microsoft/spfx-heft-plugins`, then `@microsoft/sp-webpart-base` |

### Differences from heft on purpose

heft treats `react`, `react-dom` and `react-dom/client` as SPFx libraries with fixed ids. The model does not: fast-serve bundles the project's development React for Fast Refresh. `@microsoft/microsoft-graph-client`, heft's fourth library without a manifest, is in the model.

### Roles

A model has one of two roles. The **consumer** role (the project fast-serve runs in) serves its components, its own library component included, and counts `config/serve.json` and `config/sass.json` among its model files. The **library** role (a linked library project read by the consumer) only provides the library entry, loc, tsconfig and externals; its bundles are never served by the consumer, and it counts the Library manifest instead of the serve and Sass files.

### Caching

Each fact is read the first time it is needed and kept for the lifetime of the model (a fact that fails to read is read again on the next request); facts that depend on the locale are kept per locale. Nothing is invalidated in place: the model lists the files that define it (also those of its local libraries), the dev session watches them and [restarts](../features/project-restarts.md) with a fresh model. The model also detects heft webpack customizations (`config/spfx-customize-webpack.js`, `config/webpack-patch.json` and its existing patch files) for the [startup hint](../features/rspack-extend-file.md#startup-hint-for-webpack-customizations).

### Checked against heft

On copies of the two test projects the model was compared with heft's dumped webpack config and the manifests heft wrote to `dist/`: bundle names equal heft's entries, components, versions and export names match, every library id and version in heft's manifests is in the model, and every heft external is a library or a localized resource. The only differences are the React packages above.

## Links

- [Architecture overview](overview.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: implementation behavior and unit tests on fake projects; model snapshot of copies of two SPFx 1.24.1 test projects compared with heft's webpack config dump and `dist` manifests; heft's non-standard externals list read from `@microsoft/spfx-heft-plugins`
- Confidence: high
- Last checked: 2026-11-20
