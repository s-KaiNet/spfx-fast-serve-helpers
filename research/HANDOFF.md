# Handoff: Rspack dev server for SPFx 1.24 (branch `rspack`)

**Status (2026-11-20):** R0–R23 done; only R24 (final benchmark against the Vite implementation, `heft start` and Vite `bundledDev`) remains. Package `spfx-fast-serve-helpers` `1.24.0-rspack.10`: `fast-serve` resolves options (flags, `fast-serve/config.json`, `config/serve.json`), checks the SPFx version, builds the project model, compiles every bundle with our own Rspack config (persistent cache in `temp/fast-serve/cache`) and serves the AMD bundles plus a debug `manifests.js` over HTTPS; web parts, Application Customizer, Command Set, Form Customizer and ACEs work live with HMR/Fast Refresh (several bundles per page), heft-identical CSS class names, SPFx library and `config.json` externals, localization, one error overlay per page, browser errors mapped in the terminal, restarts on project changes and the `fast-serve/rspack.extend.mjs` escape hatch. Start: spfx-bench 2.5 s uncached / 0.95 s cached, spfx-rea 1.2 s / 0.6 s; rebuild ≤ 0.14 s. User docs: [README](../README.md); last acceptance results: [kb/operations/acceptance-run.md](../kb/operations/acceptance-run.md). Task list: [rspack/PLAN.md](rspack/PLAN.md). Nothing is committed by task agents, pushed or published.

## 1. Goal

The same product as the Vite version (branch `v1.24`, `1.24.0-beta.3`): a zero-config `fast-serve` CLI that replaces `heft start` **for development only** in SPFx 1.24.x projects and serves web parts, extensions (`--config`, like heft) and ACEs on a real SharePoint page with HMR and React Fast Refresh. Built on Rspack so it can be compared with the Vite version, which makes 1000+ requests per page on big projects ([prototype and numbers](rspack/README.md), [bundled-dev comparison](bundled-dev/README.md)).

## 2. Binding decisions

| Topic | Decision |
|---|---|
| Bundler | `@rspack/core` 2.x, `@rspack/dev-server` 2.x, `@rspack/plugin-react-refresh`, `builtin:swc-loader`; package dependencies, not the project's |
| Config | **our own Rspack config, written from scratch.** Never generate or reuse heft's webpack config; never import `@microsoft/spfx-heft-plugins` internals (`WebpackConfigurationGenerator`, `ManifestPlugin`, `AsyncComponentPlugin`, `_LegacyExternals`…). Manifests, externals, localization and the CSS pipeline are ours, modelled on the Vite version. Reading heft's sources/output to learn formats is fine; public loader/typing packages the project already has (e.g. `@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin`) may be loaded from the project |
| Scope | dev server only; Heft keeps builds, type checks, packaging. Library components later, as on `v1.24` |
| Shape | zero-config CLI, options in `fast-serve/config.json` (precedence flags > file > `config/serve.json` > defaults); optional escape hatch `fast-serve/rspack.extend.mjs` + `defineConfig` (R18) |
| Behaviour | match heft for serve configurations, page order and the debug query (same rules as `v1.24`) |
| React | the project's development React, bundled and aliased (Fast Refresh); `sp-*` libraries come from the page as AMD externals |
| Package | same name and bin, versions `1.24.0-rspack.<n>`; pnpm, TypeScript 7, type-aware oxlint, vitest; **no code comments** |
| Process | one task per R-number; `pnpm -s build && pnpm -s lint && pnpm -s typecheck && pnpm -s test` green at the end of every task; the orchestrator commits after review |

## 3. Architecture

Data flow, as on `v1.24`: **config → project model → generated artifacts → Rspack compiler + dev server → browser runtime**.

- `project/`: plain Node, no Rspack import (bundles/components from `config/config.json` mapped to `src`, manifests, `serve.json`, SPFx libraries, `config.json` externals, loc, tsconfig, `sass.json`, SPFx version).
- One Rspack compilation with one entry per SPFx bundle, `output.library.type: 'amd'`, `externalsType: 'amd'`, absolute `publicPath` on `https://localhost:<port>/dist/`, in memory.
- Our `/temp/build/manifests.js`, rendered from the model and the compilation (externals each bundle uses).
- HMR runs inside each AMD bundle (Rspack runtime + React Refresh, one refresh runtime per bundle); all bundles share one compilation and the shared hot-update global is fanned out to every bundle's runtime (decided over `MultiCompiler` by measurement in R5).
- One folder per feature: `src/<feature>/index.ts` exports a named `Feature` (`{ name, contribute(context) }`) returning the feature's config contribution (rules, plugins, aliases, extensions, externals, middlewares) + runtime + tests; small modules. Features import only `featureApi/`, `project/` and `utils/` (plus another feature's `index.ts` where unavoidable, e.g. manifests → externals); what they share with the page goes through `context.page` (reload pages, page script parts rendered into `manifests.js`, server-started hooks with `firstCompile`/`onStop`), which the dev server connects after start.
- Folder layers (no cycles, checked with the review's import-graph script and madge): `cli`/`runCli` → `session` → `server` → `rspack` (composition root: ordered `FEATURES`, merge with named order rules, page channel, base config, compile problems) → features → `featureApi` (context, contribution and feature types, page-channel types, URL paths, HTTP helpers) → `project`/`config`/`utils`. Cross-folder imports go through the folder's `index.ts`.
- Project model: `createProject(root, logger, { deployedLibraries, role })` with `role: 'consumer' | 'library'`; facts are read once per model (`once`/`oncePerKey`), never invalidated (a change restarts the session with a new model); `codeRoots()` = the project plus linked library projects, used by every multi-root feature.
- What the Vite version needed and Rspack doesn't (shim, TLA facades, `require` rewrite, AMD isolation…): table in [rspack/PLAN.md](rspack/PLAN.md#vite-version-items-that-are-not-needed-with-rspack).

Today `src/` holds the CLI (`cli.ts`, `runCli.ts`, `shutdown.ts`), `config/` (options and precedence), `project/` (the model, ported from `v1.24`), `setup/` (version check + model + options at start, serve-configuration warnings, the printed summary), `aces/` (ACE banner hint, hosted-workbench URL), `featureApi/` (see above), `rspack/` (feature list, contribution merge, page channel, config builder, compile problems, one-shot compile), one folder per config feature (`entries/`, `libraries/`, `typescript/`, `externals/`, `react/`, `localization/`, `assets/`, `styles/`, `defines/`, each exporting a `Feature`) and `utils/`. Fixtures `test/fixtures/basic` and `test/fixtures/multi` come from `v1.24`; `test/fixtures/compile` drives the real-compile integration tests; `test/fixtures/extensions` (ACE, Application Customizer, Command Set, serve configurations) the extension/ACE dev-server test. Model check against heft's output: `research/rspack/scripts/model-snapshot.mjs <lib dir> <project> [snapshot.json] [heft-webpack-config.json]`; bundle structure check: `research/rspack/scripts/compare-amd.mjs <heft dist> <fast-serve output> [report.json]` (define name, dependency list, exports per bundle). Also: `server/` (dev server, compile report, banner), `manifests/`, `hmr/`, `browserErrors/` (page runtime, overlay, forwarding), `commonjs/`, `session/` (restarts), `extend/` (the extend file and public API), `cache/` (persistent-cache version fingerprint).

## 4. How to test

- Local: `pnpm -s build && pnpm -s lint && pnpm -s typecheck && pnpm -s test`. Unit tests next to the code (`*.test.ts`); integration tests run real Rspack compiles against fake SPFx projects in `test/fixtures/`.
- Test projects (never modify the originals): `/home/sergei/Projects/spfx-rea` (web parts, mixed bundle with an Application Customizer, Command Set, Field and Form Customizers, ACE; `config/serve.json` configurations `default`, `banner`, `commands`, `rating`, `feedback_*`) and `/home/sergei/Projects/spfx-bench` (1000 generated modules, Fluent, PnP, two bundles). Copy with `cp -a` to `/var/tmp/rspack-impl/`, then `pnpm build && pnpm pack` here and `npm install --save-dev <abs path to tgz>` in the copy. Use ports 4430+.
- Live: the [`spfx-debugging` skill](../.agents/skills/spfx-debugging/SKILL.md) with `.env` from the main checkout. One Chrome per profile, one tab while checking HMR, view pages only, never save or publish.
- Benchmark (R24): same harness and method as [rspack/README.md](rspack/README.md) §1.

## 5. Pointers

| What | Where |
|---|---|
| Plan, task status, open questions | [rspack/PLAN.md](rspack/PLAN.md) |
| Rspack prototype: config adaptations, HMR fixes (per-runtime hot-update global, React alias), numbers | [rspack/README.md](rspack/README.md); prototype files in `/var/tmp/rspack-research/rea/rspack/` (read only) |
| Vite `bundledDev` comparison | [bundled-dev/README.md](bundled-dev/README.md) |
| Reference implementation | branch `v1.24`: `src/`, `test/`, README, `kb/`, its HANDOFF (`git show v1.24:research/HANDOFF.md`) |
| SPFx build/serve/loader contract (bundler-independent) | [spfx-pipeline/](spfx-pipeline/index.md), [extensions/](extensions/README.md), [aces/](aces/README.md) |
| Vite-only research and user docs, kept as reference | `migration.md`, `hmr.md`, `debugging.md` (marked "Vite version only"), `vite-serve-plan/`, `vite-extensibility/`, `tla-externals/`, `pnp-scss/`, `tsconfig-decorators/`, `benchmark/`, `webpack-customization/`, `library-components/`, `spfx-1.23/` |
| Knowledge base for this branch | [../kb/index.md](../kb/index.md) |
