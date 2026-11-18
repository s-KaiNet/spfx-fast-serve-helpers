# KB index

## Core

- [AGENTS.md](AGENTS.md): KB rules (current truth, abstraction level, frontmatter, links).
- [log.md](log.md): newest-first history of KB updates.

## Concepts

SPFx platform concepts and project terms.

- [SPFx development loop and what fast-serve replaces](concepts/spfx-dev-loop.md): Heft build/`heft start` vs the Vite-based `fast-serve`, dev vs production differences, supported versions. Tags: spfx, heft, vite. Status: current.
- [SharePoint debug flow](concepts/sharepoint-debug-flow.md): debug query (`debugManifestsFile`, `debug`, `noredir`, `loadSPFX`), "Allow debug scripts?", CSP, dev certificate, LNA, sticky `sessionStorage` debug mode, hosts. Tags: spfx, sharepoint, debugging. Status: current.
- [Component manifests and the SharePoint loader](concepts/component-manifests-and-loader.md): bundles, components, module ids, `loaderConfig`/`scriptResources`/`exportName`, `manifests.js`, sp-loader + RequireJS, tenant version resolution, SPFx libraries as externals. Tags: spfx, sp-loader, requirejs, manifests. Status: current.
- [SPFx component types](concepts/spfx-component-types.md): web parts, extension kinds, ACEs, library components, serve configurations and their dev traits. Tags: spfx, web-parts, extensions, ace, library-components. Status: current.
- [Styles, localization and assets in SPFx](concepts/styles-localization-assets.md): CSS modules and class-name hashing, theme tokens, localized resources, static assets and generated typings. Tags: spfx, css-modules, theming, localization. Status: current.
- [HMR, Fast Refresh and Vite terms](concepts/hmr-and-vite-terms.md): update kinds, HMR boundaries, module-level side effects, pre-bundling, warmup, overlay, module graph. Tags: vite, hmr, react-fast-refresh. Status: current.
- [Glossary](concepts/glossary.md): short definitions of SPFx, SharePoint, Vite and project terms. Tags: glossary. Status: current.

## Architecture

System shape, data flow, modules and runtime contracts.

- [Architecture overview](architecture/overview.md): data flow config → project model → generated artifacts → Vite server → browser runtime, components and responsibilities, dependency rules, what is reused from the project vs shipped. Tags: architecture, vite, data-flow. Status: current.
- [Startup and request flows](architecture/runtime-flows.md): startup sequence (version check, certificate, listen, pre-bundle, warmup, typings), page load → manifests → bundle shim → entry → render, edit/HMR, project changes and failure paths. Tags: architecture, startup, hmr, errors. Status: current.
- [SPFx libraries and externals at runtime](architecture/spfx-libraries-and-externals.md): on-demand top-level-await facades, sync facades + per-chunk preload in pre-bundles, `loadComponentById`, `config.json` externals via scoped RequireJS, what the debug manifest lists. Tags: architecture, externals, top-level-await, pre-bundling. Status: current.
- [Source pipeline](architecture/source-pipeline.md): resolution (aliases, loc, library CSS), project-module transforms, themed styles, pre-bundling customization, generated typings. Tags: architecture, vite, transforms, pre-bundling. Status: current.

## Features

User- and developer-visible behavior of `fast-serve`.

## Decisions

Accepted technical decisions and their rationale.

## Limitations

Known limitations, gotchas, problems and open issues.

## Operations

Development workflow, toolchain, testing, live verification, packaging.

## Roadmap

Planned, researched and deferred work.

## References

External references and research conclusions (benchmarks, tool versions, platform facts).
