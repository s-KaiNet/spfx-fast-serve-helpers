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

fast-serve builds its own Rspack configuration from the [project model](../architecture/project-model.md) and compiles every SPFx bundle into one anonymous AMD module per bundle, with SPFx libraries as AMD dependencies and React bundled from the project in its development build. The configuration is the merge of the contributions of named features called in a fixed order (entries, local libraries, TypeScript, externals, React, localization, assets, styles, defines, manifests, browser errors, [HMR](hmr.md)); a contribution can also add dev-server middlewares, and features reach the page only through the build's page channel ([architecture](../architecture/overview.md#features-and-the-page-channel)). The [dev server](dev-server.md) runs the compiler in watch mode with the output in memory.

## Current Knowledge

### Shape of the configuration

- Each feature returns a contribution (entries, rules, plugins, aliases, resolve extensions, externals, dev-server middlewares); contributions are merged in feature order (rules, plugins and middlewares appended, aliases and entries merged with the later feature winning, extensions and externals deduplicated keeping the first) under a common base.
- Base: `mode: 'development'`, target web/ES2020, `devtool: 'cheap-module-source-map'`, Rspack's persistent cache in `temp/fast-serve/cache` for the dev server (memory cache for one-shot compiles; see [Startup performance and the persistent cache](performance-and-cache.md)), `optimization.nodeEnv` off (the defines own `process.env.NODE_ENV`), performance hints off, quiet infrastructure logging.
- Output: `[name].js` per bundle, `chunk.[name].js` for `import()` chunks, `library.type: 'amd'` without a name (anonymous `define`), absolute `publicPath` `https://localhost:<port>/dist/`, `hashFunction: 'xxhash64'`, `crossOriginLoading: 'anonymous'`, heft's source-map module filename templates. `uniqueName` and the JSONP global are derived from a hash of the package name, so they don't collide with the solution's installed production bundle (heft's JSONP global) on the same page.
- `amd: {}` is set on purpose: **Rspack 2 parses `define`/AMD only when `amd` is configured** (webpack enables it by default). Without it, AMD loc files evaluate to empty modules and UMD dependencies take their CommonJS/global branch.
- `module.parser.javascript.exportsPresence: 'auto'`: missing exports warn instead of failing (type-only re-exports compiled per file). A heft-like warning filter is not there yet.
- `resolve.extensions`: `.ts`, `.tsx`, `.css`, then heft's list (`.wasm`, `.mjs`, `.js`, `.json`, `.jsx`); `.js`/`.mjs` requests are not required to be fully specified.
- Watching ignores the project's build output folders (`lib`, `lib-*`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`) anchored at the project root, plus `node_modules`; same-named folders inside `src` stay watched. Watchpack tests a `RegExp` against paths with `\` turned into `/`, so the project root in the pattern accepts either separator; with a root written with backslashes, Windows projects watched their `temp` and `lib` folders (before `1.24.0-beta.8`: extra rebuilds such as one listing `temp/fast-serve/page-runtime/page-runtime.js`, a virtual module path next to the persistent cache).

### Entries

- Single-component bundle: the component's source entry file.
- Several components: a generated module re-exporting each component as `export * as <exportName>` (names from the model, same as heft's `a`, `b`, …). It is a **virtual module** under the project's `temp/fast-serve/bundle-entries/` path, provided by Rspack's experimental `VirtualModulesPlugin`; nothing is written to the project.

### TypeScript

`builtin:swc-loader` for `.ts` and `.tsx` outside `node_modules`: TypeScript syntax with decorators, classic JSX runtime with the development transform (React receives `__self`/`__source`) and the React Refresh transform, target ES2020, source maps. Decorator and class-field options, tsconfig `paths` and the `const enum`/type-only handling come from the project's tsconfig: see [TypeScript and tsconfig](typescript-and-tsconfig.md).

### Externals and React

- Externals: every SPFx library the model found (any package with an SPFx library manifest, plus `@microsoft/microsoft-graph-client`, as heft does), by exact request, `externalsType: 'amd'`. `config.json` externals are added by exact name. They become the bundle's `define` dependency list and are read as properties at use. Deep imports into libraries are bundled like heft. Details: [SPFx libraries and config.json externals](libraries-and-externals.md).
- Libraries used only inside `import()` chunks are hoisted onto the entry `define` by Rspack itself (no heft async-component plugin needed).
- React, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime` are aliased (exact requests) to the project's copies, so nested copies in dependencies (for example PnP's React 17) collapse into the project's React. React is never an external.

### Localization, assets, styles, defines

- Each `localizedResources` name is aliased to the model's strings file for the selected locale (with the `en-us` fallback) and bundled; AMD loc files parse through Rspack's AMD support, module loc files go through a small wrapper. Details: [Localized strings](localization.md).
- Images, fonts and other binary files from heft's list are `asset/resource` named `[name]_[contenthash][ext]` and referenced through the absolute `publicPath`; `.sprite.svg` is `asset/source`.
- Styles: Sass through `sass-loader`, then the project's `@microsoft/sp-css-loader`, CSS modules with heft's exact class names and theme tokens; details in [Styles, theme tokens and typings](styles-and-typings.md).
- Defines: `DEBUG` = `true`, `process.env.NODE_ENV` = `"development"` (same values as the Vite implementation).

### Comparison with heft's output

Checked on two SPFx 1.24.1 projects (7 bundles) against heft's production `dist/`: every bundle exports the same names (`default`, plus named exports such as an ACE's registry id; `a`/`b`/`c` for a three-component bundle), and each `define` dependency list equals heft's minus the React family and loc resource names, which fast-serve bundles by design. One difference per async-chunk bundle: heft lists `@microsoft/sp-core-library` (its async component loader), fast-serve lists the library the chunk uses. heft names the first bundle's `define` in some projects ([quirk](../references/spfx-heft-pipeline.md)); fast-serve's are always anonymous.

### Compile times (single machine, 3 runs, without the persistent cache; current numbers in [Startup performance](performance-and-cache.md))

| Project | Rspack compile | CLI start to exit |
|---|---|---|
| small (5 bundles, 7 components) | 0.53–0.55 s | 1.3 s |
| 1000 modules, Fluent, PnP (2 bundles) | 1.40–1.43 s | 2.2 s |

## Links

- [Startup performance and the persistent cache](performance-and-cache.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [Project model](../architecture/project-model.md)
- [Architecture overview](../architecture/overview.md)
- [CLI, options and startup](cli-and-options.md)
- [Externals semantics](../concepts/externals-semantics.md)
- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [Localized strings](localization.md)
- [Styles, theme tokens and typings](styles-and-typings.md)
- [TypeScript and tsconfig](typescript-and-tsconfig.md)
- [Rspack facts and references](../references/rspack.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)

## Evidence

- Source: integration tests with real Rspack 2.3.3 compiles on a fake SPFx project; compiles of the two test project copies from the packed `1.24.0-rspack.2` tarball, bundle structure compared with heft 1.24.1 production output by evaluating both AMD modules with stub dependencies; Rspack 2.3.3 option normalization (AMD only when configured)
- Confidence: high for structure and behaviour; times are single runs on one machine (i7-7500U)
- Last checked: 2026-11-19
