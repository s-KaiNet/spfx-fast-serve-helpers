---
title: Dependencies, versions and external docs
type: reference
status: current
tags:
  - project-kb
  - reference
  - dependencies
  - versioning
  - react
  - typescript
---

# Dependencies, versions and external docs

## Summary

Which external packages and versions `fast-serve` depends on or assumes, why each matters, and the external documentation that still affects the project. The package ships Vite and its React plugin as its own dependencies, but loads every Heft/SPFx build package (and React) from the consumer project. The SPFx side is pinned to 1.24.x; the test tenant already serves SPFx 1.25.0.

## Current Knowledge

### Runtime dependencies of the package

| Dependency | Version range | Why |
|---|---|---|
| `vite` | `^8.3.8` | the dev server; Rolldown pre-bundling, Oxc transforms, HMR client and overlay (see [Vite 8, Oxc and Rolldown facts](vite-oxc-rolldown.md)) |
| `@vitejs/plugin-react` | `^6.3.0` | React Fast Refresh (the preamble each bundle entry imports) and the JSX settings merged into Oxc |
| `rolldown` | `~1.2.19` | used directly to bundle TypeScript/ES-module loc files so their strings can be read in Node; kept on the same line as the Rolldown inside Vite 8.3.8 |
| `es-module-lexer` | `^3.0.4` | reads export names of ES modules (SPFx library entries, project modules) for facades and the type re-export guard |
| `@rushstack/debug-certificate-manager` | `^1.7.33` | the same SPFx dev certificate heft uses (`~/.rushstack/`), so HTTPS needs no option |
| `@rushstack/terminal`, `magic-string`, `picomatch`, `tinyglobby` | — | terminal output, source edits with maps, globbing |

- Vite and the React plugin being package dependencies is what lets consumers install without `--legacy-peer-deps`.
- Heft packages (`@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin`, `@rushstack/heft-static-asset-typings-plugin`, `@rushstack/heft-config-file`, `@rushstack/rig-package`) are **loaded from the consumer project**; the package only keeps them as dev dependencies pinned to the SPFx 1.24.1 set for tests. That makes the runtime dependencies independent of the SPFx minor.
- The package ships no Sass compiler: Vite's Sass compile uses the implementation installed with the project's SPFx toolchain (`sass-embedded`), with `silenceDeprecations` taken from the project's `config/sass.json` and Sass's own `NodePackageImporter` (from the same Sass package, `sass-embedded` then `sass`; 1.71+) for `pkg:` URLs (see [Styles, theme tokens and asset typings](../features/styles-and-assets.md)).
- Node `engines`: `>=22.14.0 <23`, `>=24 <25`, `>=26 <27`.

### Package toolchain

- **TypeScript 7** (`^7.0.2`) is the native compiler. Its npm package exposes only a version entry and an unstable new API, not the classic JavaScript compiler API that typescript-eslint is built on, so typescript-eslint cannot run against it. Type-aware linting uses `oxlint` with `oxlint-tsgolint` instead; tests use `vitest` 5. See [Package toolchain and code conventions](../decisions/toolchain-and-conventions.md).
- The consumer project's own TypeScript (`~5.8` in SPFx 1.24 projects) is never used by `fast-serve` for transforms; Oxc compiles per file and `heft build` stays the type-checking gate.

### SPFx and React versions

- **SPFx 1.24.1** toolchain: `@microsoft/spfx-heft-plugins` 1.24.1, `@rushstack/heft` 1.3.2, webpack 5.105.4, `@rushstack/heft-sass-plugin` 1.5.0, `sass-embedded` 1.85.1, TypeScript ~5.8. The package accepts `@microsoft/sp-core-library` `>=1.24.0 <1.25.0` ([Version policy](../decisions/version-policy.md)).
- **React 18.3.1** in SPFx 1.24 (externals `react` and `react-dom/client`, `createRoot`); SPFx 1.23 uses React 17.0.1 with `react-dom` and `ReactDOM.render`. `fast-serve` serves the project's **development** React copy, deduplicated ([Development React](../decisions/development-react.md)).
- **Tenant runtime**: the test tenant serves every `@microsoft/sp-*` library at **1.25.0** and React 18.3.1. Libraries resolve to the tenant's same-major newer version, as in production; a project newer than the tenant fails in production too.

### Third-party package shapes that matter

- `@pnp/spfx-controls-react` 3.25.0 imports `./X.module.scss` but ships only `X.module.scss.css` (Sass output, CSS modules not applied, with `:global`, `:export` and theme tokens); it also nests React 17 and `@types/react` 17 (needs React dedupe, and npm `overrides` for `heft build`).
- `@pnp/spfx-property-controls` 3.13 ships already-hashed CSS that SPFx's module rule hashes again; handling it was cut ([Scope cuts](../decisions/scope-cuts.md)).
- `@microsoft/sp-lodash-subset` ships an AMD blob in its "ESM" folder; its export names have to be read by evaluating it.
- `@fluentui/font-icons-mdl2` exposes `IconNames` only as a `const enum`, which per-file compilation cannot provide.
- `@microsoft/sp-adaptive-card-extension-base` is an SPFx library like `@microsoft/sp-*`, so ACEs need no special loading.

### External docs and platform facts

- **Microsoft Learn, ACE tutorial** (<https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension>): serve locally and add the card to a test SharePoint page, not the workbench. The generator's `initialPage` still points at `/_layouts/15/workbench.aspx`.
- **SharePoint Online hosted workbench**: deprecated since 2026-05-13 and **retired on 2026-12-01** (Microsoft's SPFx Debug Toolbar documentation). Until then it keeps an unsaved canvas across reloads; card interaction works only in Preview/read mode. See [Unsupported scope](../limitations/unsupported-scope.md).
- **Microsoft Learn, library component tutorial** (<https://learn.microsoft.com/en-us/sharepoint/dev/spfx/library-component-tutorial>): requires `"main": "lib/index.js"` in the library, which the 1.24 generator omits ([Library components](../roadmap/library-components.md)).
- **SharePoint CSP**: `localhost` script sources are allowed only with the debug query; no `connect-src`/`style-src`/`img-src` directives (details in [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)).
- **Chrome/Edge Local Network Access** (Chrome 142+): a public page requesting `https://localhost` needs the user's permission; the dev server sends `Access-Control-Allow-Private-Network: true` ([Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)).
- **oxc-project/oxc-resolver#1357**: the tsconfig auto-lookup bug with rig-extended `include`; watch it on Vite upgrades.
- **Classic spfx-fast-serve** (<https://github.com/s-KaiNet/spfx-fast-serve>) with `spfx-fast-serve-helpers@~1.21.0` or earlier remains the tool for gulp/webpack SPFx up to 1.21; it used one branch and release line per SPFx minor.

## Links

- [SPFx 1.24 Heft pipeline](spfx-heft-pipeline.md)
- [Vite 8, Oxc and Rolldown facts](vite-oxc-rolldown.md)
- [Development workflow and toolchain](../operations/development-workflow.md)
- [SPFx 1.23 support](../roadmap/spfx-1-23-support.md)

## Evidence

- Source: package manifest and installed packages, project handoff notes, SPFx 1.23 version comparison research, ACE and library components research (Microsoft Learn pages as cited there), benchmark and library CSS research
- Confidence: high for versions and package shapes; medium for the Rolldown pin rationale; the workbench retirement date is stated by Microsoft docs as cited in research (not re-checked online)
- Last checked: 2026-11-19
