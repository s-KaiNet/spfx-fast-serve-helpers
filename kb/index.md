# KB index

Knowledge base for the **Rspack implementation** of `fast-serve` (separate from the Vite implementation's KB).

## Core

- [AGENTS.md](AGENTS.md): KB rules (current truth, abstraction level, frontmatter, links).
- [log.md](log.md): newest-first history of KB updates.

## Concepts

Bundler-independent SPFx platform concepts.

- [SharePoint debug flow](concepts/sharepoint-debug-flow.md): debug query (`debugManifestsFile`, `debug`, `noredir`, `loadSPFX`), "Allow debug scripts?", CSP, dev certificate, LNA, sticky debug mode, hosts. Tags: spfx, sharepoint, debugging. Status: current.
- [Component manifests and the SharePoint loader](concepts/component-manifests-and-loader.md): bundles, components, module ids, `loaderConfig`/`scriptResources`/`exportName`, `manifests.js`, sp-loader + RequireJS, tenant version resolution, SPFx libraries as externals. Tags: spfx, sp-loader, requirejs, manifests. Status: current.
- [SPFx component types](concepts/spfx-component-types.md): web parts, extension kinds, ACEs, library components, serve configurations and their dev traits. Tags: spfx, web-parts, extensions, ace. Status: current.
- [Externals semantics](concepts/externals-semantics.md): what is external, how AMD externals behave in webpack/Rspack output (property reads, namespace, default, `export *`, `require`), manifest side, why the Vite-era emulation is not needed. Tags: externals, amd, webpack. Status: current.

## Architecture

- [Architecture overview](architecture/overview.md): data flow config → project model → generated artifacts → Rspack compiler and dev server → browser runtime, responsibilities, dependency rules, differences from the Vite implementation. Tags: architecture, rspack, data-flow. Status: current.
- [Project model](architecture/project-model.md): bundler-free SPFx facts (bundles, components, export names, manifests, serve configurations, SPFx libraries incl. `@microsoft/microsoft-graph-client`, `config.json` externals, loc, tsconfig, `sass.json`, SPFx version), deliberate differences from heft (React), caching and invalidation, check against heft's output. Tags: architecture, project-model, spfx. Status: current.

## Features

- [Rspack compile](features/rspack-compile.md): own Rspack config from feature contributions, anonymous AMD bundles, virtual multi-component entries, `amd: {}`, SPFx library externals, bundled development React with alias, SWC defaults, initial loc/assets/Sass + `sp-css-loader`/defines, comparison with heft's `dist/`, compile times. Tags: rspack, bundling, amd, externals. Status: current.
- [Dev server, debug manifests and debug URL](features/dev-server.md): `@rspack/dev-server` over HTTPS with the SPFx certificate, bundles from memory under `/dist/`, `manifests.js` (per-bundle library `scriptResources` from the compile, `sp-loader`, port-correct base URL, `no-store`), icons, CORS/PNA headers, `allowedHosts`, port check, ready banner and debug query, shutdown, measured start and requests. Tags: dev-server, manifests, https, debugging. Status: current.
- [HMR and React Fast Refresh](features/hmr.md): what hot-updates vs reloads, refresh loader and per-bundle refresh entry, project React, hot-update fan-out for several bundles, hot styles without piling up `<style>` elements, `no-store` hot-update files, quiet console, live edit → DOM times and memory. Tags: hmr, fast-refresh, dev-server. Status: current.
- [Extensions and Adaptive Card Extensions](features/extensions-and-aces.md): serve configuration selection and heft's extension query, startup warnings for configurations, ACE manifests/templates/images/lazy property-pane chunks, ACE banner hint and site workbench URL, hosted-workbench 4321 probe warning, live results. Tags: extensions, ace, serve-configurations. Status: current.
- [SPFx libraries and config.json externals](features/libraries-and-externals.md): libraries as AMD externals with per-bundle `component` resources, deep imports bundled like heft with a warning naming the importing project file (none for dependencies), `config.json` externals (URL, local file served under `/dist/`, `globalName`, `globalDependencies`) in heft's manifest format, webpack import semantics, reload when a bundle's external list changes or a local external is edited, live results. Tags: externals, spfx-libraries, manifests. Status: current.
- [Localized strings](features/localization.md): `localizedResources` bundled for `--locale` with per-resource `en-us` fallback, AMD/TypeScript/ES loc files and heft's warning, library strings (`ControlStrings`), hot update vs reload on string edits, difference from heft's separate loc files. Tags: localization, loc. Status: current.
- [Styles, theme tokens and typings](features/styles-and-typings.md): Sass via `sass-loader` + project `sp-css-loader`, heft-identical class names (lib CSS path and source-map comment in the hash), `pkg:`/`~`/`loadPaths`, `sass.json` deprecation settings, global and `node_modules` CSS, theme tokens, SCSS and static asset typings at start and on edits, HMR. Tags: styles, sass, css-modules, theming, typings. Status: current.
- [TypeScript and tsconfig](features/typescript-and-tsconfig.md): SWC decorator/metadata/class-field options from the tsconfig chain, `paths` through Rspack's tsconfig resolver, type-only names harmless under webpack with filtered warnings, `const enum` errors for declaration-only enums. Tags: typescript, tsconfig, decorators, const-enum. Status: current.
- [Errors, overlay and terminal output](features/errors-and-diagnostics.md): one overlay per page from a page runtime in `manifests.js`, compile problems with project paths and short rebuild lines, project runtime errors forwarded and source-mapped to the terminal, readable bundle load errors (compile error, missing external or library) in the web part box, reload after a failed load, runtime-error overlay closed by the next successful update and re-opened when the error repeats. Tags: errors, overlay, terminal. Status: current.
- [require() and AMD in dependencies](features/require-and-amd.md): webpack semantics for `require()` of CommonJS/ESM/JSON/assets/SPFx libraries/externals and for UMD dependencies with an AMD branch (full lodash), no emulation, `amdPackages` dropped. Tags: require, amd, requirejs. Status: current.
- [Restarts on project changes](features/project-restarts.md): dev session that restarts on `package.json`, `config/*.json`, `fast-serve/config.json`, tsconfig, manifests and extend-file edits, content-based watching, failing restarts keep the old server, short restart line, pages reload by themselves (new hash salt). Tags: dev-session, restarts. Status: current.
- [Rspack extend file](features/rspack-extend-file.md): `fast-serve/rspack.extend.mjs` (`.mts`/`.ts`/`.cjs`… bundled with Rspack), `defineConfig`, context and env, public types and `rspack` re-export, webpack-merge semantics, dev-server additions, guarded keys, restarts and errors, webpack-customization hint, shipped `fast-serve-rspack-config` skill. Tags: rspack, configuration, webpack-customization, agent-skill. Status: current.
- [Startup performance and the persistent cache](features/performance-and-cache.md): Rspack persistent cache in `temp/fast-serve/cache` with a version fingerprint of the config and project files, typings after the first compile, lazily loaded Sass, before/after start numbers, levers measured and rejected (eval/no source maps, lazy compilation). Tags: performance, cache, rspack. Status: current.
- [CLI, options and startup](features/cli-and-options.md): flags, `fast-serve/config.json` (dropped `amdPackages`, old file warning), precedence, page order, `{tenantDomain}`, startup order and summary, failures and exit codes, shutdown signals. Tags: cli, options, startup. Status: current.

## Operations

- [Acceptance run on the test projects](operations/acceptance-run.md): procedure (copies, tarball, live checks with a page marker and DOM timing) and the last results for every component type, HMR across bundles, errors, restarts, extend file, locale, cache and heft build. Tags: acceptance, live-verification. Status: current.
- [Final benchmark against Vite fast-serve and heft start](operations/final-benchmark.md): 100/250/500 generated components, two bundles, 3 starts per cell; start, start + first render, cold/F5 load, requests, bytes, server CPU, edit → DOM with state check, memory, scaling per 100 components, crossover, recommendation (Rspack from about 100 components, Vite for small projects), heft's two-bundle HMR not applying. Tags: benchmark, performance. Status: current.

## Limitations

- [npm peer conflict with css-loader 7.1.2](limitations/npm-css-loader-peer-conflict.md): `ERESOLVE` when the project's `css-loader` is 7.1.2/7.1.3 (optional peer `@rspack/core` 0.x/1.x), fix by installing `css-loader@^7.1.4` in the same command or `--legacy-peer-deps` / `.npmrc`, why no package-side fix exists. Tags: install, npm, dependencies. Status: current.

## Decisions

- [One compilation for several bundles](decisions/several-bundles-one-compilation.md): one compilation with a hot-update fan-out instead of a `MultiCompiler` per bundle, with the measurements (start, memory, rebuild). Tags: decision, hmr, rspack. Status: current.
- [Rspack with our own configuration](decisions/rspack-with-own-config.md): own Rspack config from the project model, no heft webpack config or heft-plugin internals, what may be loaded from the project, same product contract and architecture as the Vite implementation. Tags: decision, rspack, architecture, heft. Status: current.

## Roadmap

- [Roadmap overview](roadmap/overview.md): phases 0–3 and the final benchmark, Vite-era features expected to be unnecessary, open questions, out of scope. Tags: roadmap, status. Status: current.

## References

- [Rspack facts and references](references/rspack.md): versions, Rspack 2 behaviours (hash function, AMD library/externals, AMD parsing off by default, async-chunk externals, externals cannot be added by a hot update, virtual modules, `exportsPresence`, webpack-only hooks, `finishModules`/`rawRequest`), `@rspack/dev-server` host checks, listen errors, middleware order, exit signals and `static-changed` reloads, HMR inside SharePoint pages (shared hot-update global, runtime-module hook, refresh plugin 2.0 options and injection flag, `hot.data`, React alias, hidden-tab throttling), dev-server client window messages and per-client overlays, line-only source maps and source names, how failed modules and external scripts surface in SharePoint, prototype numbers, external docs. Tags: reference, rspack, hmr, dependencies. Status: current.
- [SPFx 1.24 Heft pipeline (reverse-engineered)](references/spfx-heft-pipeline.md): build phases, webpack customization mechanics, generated config and AMD bundle format (first-bundle named `define` quirk), export names, CSS class-name hashing, externals, manifest and `manifests.js` shape, loc file forms, typings tasks, `heft start` behaviour and bugs, loader/CSP facts. Tags: reference, spfx, heft, webpack, manifests. Status: current.
