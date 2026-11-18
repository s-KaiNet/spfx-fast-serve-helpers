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

- [CLI, options and startup](features/cli-and-options.md): install requirements, flags, `config/fast-serve.json`, precedence and page order, `{tenantDomain}`/`SPFX_SERVE_TENANT_DOMAIN`, ready banner, startup failures and exit codes. Tags: cli, options, configuration, startup. Status: current.
- [Serving web parts, extensions and ACEs](features/serving-components.md): multi-component bundles, dev icon URLs, `serveConfigurations` and `--config`, heft-matching extension query, serve configuration warnings, ACEs and the hosted workbench. Tags: web-parts, extensions, ace, serve-configurations. Status: current.
- [HMR and Fast Refresh](features/hmr-and-fast-refresh.md): what hot-updates, what reloads the page, what restarts the server, guidance for HMR-friendly code. Tags: hmr, react-fast-refresh. Status: current.
- [Styles, theme tokens and asset typings](features/styles-and-assets.md): SPFx CSS module names, theme tokens, library `.module.scss.css` via `@microsoft/sp-css-loader`, `temp/sass-ts` and `temp/static-asset-ts` typings, static asset URLs. Tags: styles, css-modules, theming, assets, typings. Status: current.
- [TypeScript source compatibility](features/typescript-compatibility.md): tsconfig `paths`, decorator/class-field options, `emitDecoratorMetadata` type imports, type re-exports, `require()` rewriting, `const enum` messages, defines. Tags: typescript, tsconfig, decorators, const-enum. Status: current.
- [Localized strings](features/localization.md): `localizedResources` modules, locale fallback, AMD vs TS/ES loc files and the heft warning, string HMR. Tags: localization, loc. Status: current.
- [SPFx library imports and config.json externals](features/library-imports-and-externals.md): tenant-version SPFx libraries on demand, project development React, `config.json` externals validation and named-import rule. Tags: externals, spfx-libraries, sp-loader. Status: current.
- [Errors and diagnostics](features/errors-and-diagnostics.md): terminal forwarding rule, error overlay and `overlay` option, readable bundle load errors and auto-reload, troubleshooting messages, source maps and VS Code debugging. Tags: errors, overlay, debugging, troubleshooting. Status: current.

## Decisions

Accepted technical decisions and their rationale.

- [Dev server only; Heft keeps builds, checks and packaging](decisions/dev-server-only.md): never production builds; no type checking, linting or other non-dev options; only typings written, into heft's `temp/` folders with heft's own logic. Tags: decision, scope, heft. Status: current.
- [Zero-config CLI without a public Vite plugin API](decisions/zero-config-cli.md): `fast-serve` owns the Vite config, `exports` only `./package.json`, small option set with fixed precedence, automatic HTTPS. Tags: decision, cli, configuration, vite. Status: current.
- [Version policy: package follows the SPFx minor](decisions/version-policy.md): `spfx-fast-serve-helpers@~1.24.0` for SPFx 1.24.x only, startup version check, 1.22/1.23 unsupported (1.23 researched, undecided). Tags: decision, versioning, spfx. Status: current.
- [Development React from the project for Fast Refresh](decisions/development-react.md): development React/react-dom from the project, deduplicated, instead of the page's production React. Tags: decision, react, react-fast-refresh. Status: current.
- [On-demand SPFx library facades with top-level await](decisions/on-demand-library-facades.md): `loadComponentById` facades (TLA + CJS sync + per-chunk preload) over preloading or listing libraries in the manifest; measured rationale. Tags: decision, externals, top-level-await, spfx-libraries. Status: current.
- [Unbundled dev server and entry-graph warmup](decisions/unbundled-dev-and-warmup.md): no `experimental.bundledDev`; Vite `server.warmup` off, entry graph warmed after first pre-bundling, typings after it, filtered pre-bundle hooks. Tags: decision, performance, vite, warmup. Status: current.
- [Build from scratch with semantic modules](decisions/semantic-architecture.md): no port of the old structure; feature components, Vite-free project model, artifacts rendered on request, TS browser runtime. Tags: decision, architecture. Status: current.
- [Match heft behavior for serve configurations and the debug URL](decisions/match-heft-serve-behavior.md): unknown `--config` falls back to `default`, heft's page order, query replacement, no `debug=true` for extensions. Tags: decision, extensions, serve-configurations, heft. Status: current.
- [TypeScript handling without tsc](decisions/typescript-handling.md): own tsconfig-paths resolver, compiler-option whitelist to Oxc with lookup off, type re-export guard that warns and removes, explained `const enum` limits. Tags: decision, typescript, tsconfig, oxc. Status: current.
- [Error reporting: project errors only, overlay for runtime errors](decisions/error-reporting.md): stack-frame rule for terminal forwarding, overlay for uncaught errors and rejections (not `console.error`), `overlay` opt-out. Tags: decision, errors, overlay, terminal. Status: current.
- [Scope cuts and features dropped on purpose](decisions/scope-cuts.md): theme-change monitoring, `config/sass.json` in Vite's Sass compile, locale switch, `@pnp/spfx-property-controls` 3.13 CSS. Tags: decision, scope, theming, styles, localization. Status: needs-clarification.
- [Package toolchain and code conventions](decisions/toolchain-and-conventions.md): pnpm, TypeScript 7, type-aware oxlint instead of ESLint/typescript-eslint, no code comments, no source maps in the package, approval-first process. Tags: decision, toolchain, typescript, oxlint, pnpm. Status: current.

## Limitations

Known limitations, gotchas, problems and open issues.

- [Dev vs production differences](limitations/dev-vs-production.md): one shared ES module graph, development React, every external in every manifest, no type checks, ES-module loc files, page-load performance on very large projects. Tags: limitations, production-parity, react, externals, performance. Status: current.
- [HMR gotchas](limitations/hmr-gotchas.md): mixed exports, services imported by component classes, module-level side effects and state, ACE edits reload, class components, config edits, theme switch. Tags: limitations, hmr, react-fast-refresh, ace. Status: current.
- [TypeScript limits of per-file compilation](limitations/typescript-limits.md): `const enum` from `.d.ts`/dependencies, `emitDecoratorMetadata` type imports and primitive metadata, type re-exports, `require()`, no type checking. Tags: limitations, typescript, const-enum, decorators. Status: current.
- [Unsupported scope](limitations/unsupported-scope.md): library components (hook error #321 with libraries loaded as components, linked-library export and CSS issues), SPFx 1.22/1.23, localized command titles, localhost only, workbench retirement. Tags: limitations, library-components, versioning, extensions, react. Status: current.
- [Environment and browser gotchas](limitations/environment-and-browser-gotchas.md): sticky debug mode, certificate trust, Local Network Access, `localhost` only, port clash, remote/SSH setups. Tags: limitations, debugging, certificate, local-network-access, remote-development. Status: current.
- [Known issues and fragile points](limitations/known-issues.md): Field Customizer not instantiated on the test tenant, skipped page-load hang (Chrome HTTP/2 stall), error forwarding gaps, overlay hint tied to Vite's client text, VS Code F5 unverified. Tags: limitations, open-issues, errors, overlay, extensions. Status: current.

## Operations

Development workflow, toolchain, testing, live verification, packaging.

- [Development workflow and toolchain](operations/development-workflow.md): Node engines, pnpm, scripts (`build`, `dev`, `typecheck`, `lint`, `test`, `prepublishOnly`), Node vs browser-runtime compilation, no-comments rule, tests next to code with fake-SPFx fixtures, process rules. Tags: operations, toolchain, pnpm, typescript, oxlint, vitest. Status: current.
- [Local testing and consumer setup](operations/local-testing-and-consumer-setup.md): `pnpm pack` + `file:` tarball install and reinstall gotcha, consumer setup steps, the small SPFx test project and the large benchmark project, tenant test pages, release acceptance checklist. Tags: operations, packaging, testing, test-projects. Status: needs-clarification.
- [Live verification on a SharePoint tenant](operations/live-verification.md): agent-browser with headless Chrome and the saved profile, certificate/LNA flags, debug query, useful checks, proving a hot update with a marker and counter, cleanup and never saving pages. Tags: operations, verification, agent-browser, sharepoint, hmr. Status: current.
- [Benchmark method](operations/benchmark-method.md): CDP harness on the generated benchmark project, what is measured (start, loads, edits, network, memory, crawl), reproduce commands, lighter checks used for the package. Tags: operations, benchmark, performance. Status: current.
- [VS Code debugging and remote development](operations/debugging-and-remote-development.md): `launch.json` launch/attach with path mapping (F5 unverified), DevTools, SSH from Windows with same-port forward and Rushstack CA import. Tags: operations, debugging, vscode, remote-development, certificate. Status: needs-clarification.

## Roadmap

Planned, researched and deferred work.

- [Roadmap overview and pending actions](roadmap/overview.md): status of `1.24.0-beta.0`, pending user actions (VS Code F5, push/publish decision, library and 1.23 decisions), ordered next steps, nothing pushed or published. Tags: roadmap, status, release. Status: current.
- [SPFx 1.23 support](roadmap/spfx-1-23-support.md): feasible, recommended one package for `>=1.23 <1.25` with a per-minor profile (~2–3 days); CSS module rule gap, React 17 notes, packaging options, plan. Tags: roadmap, versioning, spfx, css-modules, react. Status: current.
- [Library components](roadmap/library-components.md): recommended option B (linked libraries served from source in the consumer graph, effort M), why the heft/classic approach fails (hook error #321), ESM `main` export-name prerequisite, dev/prod differences, untested areas. Tags: roadmap, library-components, react, hmr. Status: current.
- [Deferred work](roadmap/deferred-work.md): skipped page-load hang and how to resume, tunnels, Docker/WSL, Teams hosts, re-mount instead of reload (idea and limits). Tags: roadmap, hmr, remote-development, teams. Status: current.

## References

External references and research conclusions (benchmarks, tool versions, platform facts).

- [SPFx 1.24 Heft pipeline (reverse-engineered)](references/spfx-heft-pipeline.md): build phases, generated webpack config, AMD bundle format, export names, CSS class-name hashing, externals, manifest and `manifests.js` shape, loc file forms, typings tasks, `heft start` behavior and bugs, loader/CSP facts. Tags: reference, spfx, heft, webpack, manifests. Status: current.
- [Vite 8, Oxc and Rolldown facts relied upon](references/vite-oxc-rolldown.md): HTTP/2 with HTTPS, Oxc tsconfig auto-lookup bug and inline `oxc.tsconfig`, `resolve.tsconfigPaths` gap, CSS module detection by id, pre-bundling plugin rules and TLA, warmup, overlay. Tags: reference, vite, oxc, rolldown, typescript. Status: current.
- [Benchmark results and performance conclusions](references/benchmark-results.md): PoC-era Vite vs `heft start` numbers, what dominates page load, warmup and facade tuning results, acceptance numbers, stall statistics. Tags: reference, benchmark, performance. Status: current.
- [Dependencies, versions and external docs](references/dependencies-and-external-docs.md): runtime dependencies and why, Heft packages loaded from the project, TypeScript 7 and dropping typescript-eslint, SPFx/React/tenant versions, third-party package shapes, Microsoft docs (ACE tutorial, workbench retirement 2026-12-01), CSP/LNA. Tags: reference, dependencies, versioning, react, typescript. Status: current.
