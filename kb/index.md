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

- [Architecture overview](architecture/overview.md): target data flow config → project model → generated artifacts → Rspack compiler and dev server → browser runtime, responsibilities, dependency rules, differences from the Vite implementation. Tags: architecture, rspack, data-flow. Status: draft.
- [Project model](architecture/project-model.md): bundler-free SPFx facts (bundles, components, export names, manifests, serve configurations, SPFx libraries incl. `@microsoft/microsoft-graph-client`, `config.json` externals, loc, tsconfig, `sass.json`, SPFx version), deliberate differences from heft (React), caching and invalidation, check against heft's output. Tags: architecture, project-model, spfx. Status: current.

## Features

- [CLI, options and startup](features/cli-and-options.md): flags, `fast-serve/config.json` (dropped `amdPackages`, old file warning), precedence, page order, `{tenantDomain}`, startup order and summary, failures and exit codes, shutdown signals. Tags: cli, options, startup. Status: current.

## Decisions

- [Rspack with our own configuration](decisions/rspack-with-own-config.md): own Rspack config from the project model, no heft webpack config or heft-plugin internals, what may be loaded from the project, same product contract and architecture as the Vite implementation. Tags: decision, rspack, architecture, heft. Status: current.

## Roadmap

- [Roadmap overview](roadmap/overview.md): phases 0–3 and the final benchmark, Vite-era features expected to be unnecessary, open questions, out of scope. Tags: roadmap, status. Status: current.

## References

- [Rspack facts and references](references/rspack.md): versions, Rspack 2 behaviours (hash function, AMD library/externals, `exportsPresence`, webpack-only hooks), HMR inside SharePoint pages (per-runtime hot-update global, React alias), prototype numbers, external docs. Tags: reference, rspack, hmr, dependencies. Status: current.
- [SPFx 1.24 Heft pipeline (reverse-engineered)](references/spfx-heft-pipeline.md): build phases, webpack customization mechanics, generated config and anonymous AMD bundle format, export names, CSS class-name hashing, externals, manifest and `manifests.js` shape, loc file forms, typings tasks, `heft start` behaviour and bugs, loader/CSP facts. Tags: reference, spfx, heft, webpack, manifests. Status: current.
