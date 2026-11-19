---
title: Rspack compile
type: feature
status: current
tags:
  - project-kb
  - rspack
  - bundling
  - amd
  - externals
---

# Rspack compile

## Summary

fast-serve builds its own Rspack configuration from the [project model](../architecture/project-model.md) and compiles every SPFx bundle into one anonymous AMD module per bundle, with SPFx libraries as AMD dependencies and React bundled from the project in its development build. The configuration is the merge of small feature contributions (entries, TypeScript, externals, React, localization, assets, styles, defines). Until the dev server exists, the CLI runs one compile into `temp/fast-serve/dist` and reports it.

## Current Knowledge

### Shape of the configuration

- Each feature returns a contribution (entries, rules, plugins, aliases, resolve extensions, externals); contributions are merged in a fixed order (rules and plugins appended, aliases and entries merged, extensions and externals deduplicated) under a common base.
- Base: `mode: 'development'`, target web/ES2020, `devtool: 'cheap-module-source-map'`, memory `cache: true`, `optimization.nodeEnv` off (the defines own `process.env.NODE_ENV`), performance hints off, quiet infrastructure logging.
- Output: `[name].js` per bundle, `chunk.[name].js` for `import()` chunks, `library.type: 'amd'` without a name (anonymous `define`), absolute `publicPath` `https://localhost:<port>/dist/`, `hashFunction: 'xxhash64'`, `crossOriginLoading: 'anonymous'`, heft's source-map module filename templates. `uniqueName` and the JSONP global are derived from a hash of the package name, so they don't collide with the solution's installed production bundle (heft's JSONP global) on the same page.
- `amd: {}` is set on purpose: **Rspack 2 parses `define`/AMD only when `amd` is configured** (webpack enables it by default). Without it, AMD loc files evaluate to empty modules and UMD dependencies take their CommonJS/global branch.
- `module.parser.javascript.exportsPresence: 'auto'`: missing exports warn instead of failing (type-only re-exports compiled per file). A heft-like warning filter is not there yet.
- `resolve.extensions`: `.ts`, `.tsx`, `.css`, then heft's list (`.wasm`, `.mjs`, `.js`, `.json`, `.jsx`); `.js`/`.mjs` requests are not required to be fully specified.
- Watching ignores the project's build output folders (`lib`, `lib-*`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`) anchored at the project root, plus `node_modules`; same-named folders inside `src` stay watched.

### Entries

- Single-component bundle: the component's source entry file.
- Several components: a generated module re-exporting each component as `export * as <exportName>` (names from the model, same as heft's `a`, `b`, …). It is a **virtual module** under the project's `temp/fast-serve/bundle-entries/` path, provided by Rspack's experimental `VirtualModulesPlugin`; nothing is written to the project.

### TypeScript

`builtin:swc-loader` for `.ts` and `.tsx` outside `node_modules`: TypeScript syntax with decorators, legacy decorators, `useDefineForClassFields: false`, classic JSX runtime with the development transform (React receives `__self`/`__source`), target ES2020, source maps. These are the SPFx rig defaults; tsconfig-derived options come later.

### Externals and React

- Externals: every SPFx library the model found (any package with an SPFx library manifest, plus `@microsoft/microsoft-graph-client`, as heft does), by exact request, `externalsType: 'amd'`. They become the bundle's `define` dependency list and are read as properties at use. Deep imports into libraries are not externals yet.
- Libraries used only inside `import()` chunks are hoisted onto the entry `define` by Rspack itself (no heft async-component plugin needed).
- React, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime` are aliased (exact requests) to the project's copies, so nested copies in dependencies (for example PnP's React 17) collapse into the project's React. React is never an external.

### Localization, assets, styles, defines (initial versions)

- Each `localizedResources` name is aliased to the model's strings file for the selected locale (with the `en-us` fallback) and bundled; AMD loc files parse through Rspack's AMD support.
- Images, fonts and other binary files from heft's list are `asset/resource` named `[name]_[contenthash][ext]` and referenced through the absolute `publicPath`; `.sprite.svg` is `asset/source`.
- Styles: `.scss` goes through `sass-loader` (the project's `sass-embedded`, else `sass`; modern compiler API; `silenceDeprecations` from the merged `config/sass.json`; Sass `NodePackageImporter` for `pkg:` URLs) and then the project's `@microsoft/sp-css-loader`, with heft's split: `.module.scss`, `.module.css` and `.module.scss.css` as CSS modules with SPFx class names (`<class>_<8 hex>`), other `.css`/`.scss` global; theme tokens stay for `@microsoft/load-themed-styles`. Class names don't match heft's yet (the hash input is the `.scss` source path instead of heft's compiled `lib` CSS file). Missing `sp-css-loader` or Sass is a warning, and style imports then fail to compile.
- Defines: `DEBUG` = `true`, `process.env.NODE_ENV` = `"development"` (same values as the Vite implementation).

### Comparison with heft's output

Checked on two SPFx 1.24.1 projects (7 bundles) against heft's production `dist/`: every bundle exports the same names (`default`, plus named exports such as an ACE's registry id; `a`/`b`/`c` for a three-component bundle), and each `define` dependency list equals heft's minus the React family and loc resource names, which fast-serve bundles by design. One difference per async-chunk bundle: heft lists `@microsoft/sp-core-library` (its async component loader), fast-serve lists the library the chunk uses. heft names the first bundle's `define` in some projects ([quirk](../references/spfx-heft-pipeline.md)); fast-serve's are always anonymous.

### Compile times (single machine, 3 runs)

| Project | Rspack compile | CLI start to exit |
|---|---|---|
| small (5 bundles, 7 components) | 0.53–0.55 s | 1.3 s |
| 1000 modules, Fluent, PnP (2 bundles) | 1.40–1.43 s | 2.2 s |

## Links

- [Project model](../architecture/project-model.md)
- [Architecture overview](../architecture/overview.md)
- [CLI, options and startup](cli-and-options.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [Rspack facts and references](../references/rspack.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)

## Evidence

- Source: integration tests with real Rspack 2.3.3 compiles on a fake SPFx project; compiles of the two test project copies from the packed `1.24.0-rspack.2` tarball, bundle structure compared with heft 1.24.1 production output by evaluating both AMD modules with stub dependencies; Rspack 2.3.3 option normalization (AMD only when configured)
- Confidence: high for structure and behaviour; times are single runs on one machine (i7-7500U)
- Last checked: 2026-11-19
