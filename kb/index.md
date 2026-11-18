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
