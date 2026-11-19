---
title: Local testing and consumer setup
type: operation
status: current
tags:
  - project-kb
  - operations
  - packaging
  - testing
  - test-projects
---

# Local testing and consumer setup

## Summary

Changes to the package are tested in real SPFx 1.24 projects by packing it into a tarball and installing that tarball into the project; a project does not see source changes until the tarball is rebuilt and reinstalled. This page describes that loop, how a consumer project is set up for `fast-serve` (the same steps users follow), the two test projects used for verification and what they cover, and the acceptance checklist re-run before a release.

## Current Knowledge

### Pack and install the package locally

1. In the repository: `pnpm build && pnpm pack`. The tarball is named `spfx-fast-serve-helpers-<version>.tgz` after the version in `package.json` and is git-ignored.
2. Install the packed tarball in the test project: `npm install --save-dev <path to the repository>/spfx-fast-serve-helpers-<version>.tgz`. The project then depends on it through a `file:` reference that names that exact file, so when the package version changes, install the newly named tarball again; the test projects currently use the tarball of the current version (for example `spfx-fast-serve-helpers-1.24.0-beta.2.tgz`).
3. **Reinstall after every rebuild** (`npm install` in the project, forcing a reinstall of the package if needed). The package manager caches the tarball contents by reference, so a rebuilt tarball under the same name is not picked up by itself; a stale install is the usual reason a fix "doesn't work" in the test project. Restart `fast-serve` afterwards.
4. Check the result also with the project's own `npm run build` (Heft), which must still pass: `fast-serve` writes only typings into `temp/`.

### Setting up a consumer project

1. The project must be SPFx **1.24.x** on a supported Node version; `fast-serve` exits with `Unsupported SPFx version` otherwise (see [Version policy](../decisions/version-policy.md)).
2. Install: `npm install --save-dev spfx-fast-serve-helpers@~1.24.0` (or `pnpm add -D`). No `--legacy-peer-deps`; Vite and `@vitejs/plugin-react` come with the package, React comes from the project.
3. Trust the SPFx development certificate once per machine: `npx heft trust-dev-cert` (the same certificate `heft start` uses), then restart the browser.
4. Add a script: `"serve": "fast-serve"` next to the existing heft `start` script. Run only one of the two at a time; both default to port 4321.
5. Optionally set the page in `fast-serve/config.json` (`pageUrl`, may use `{tenantDomain}` with `SPFX_SERVE_TENANT_DOMAIN`); otherwise `config/serve.json` pages are used (see [CLI, options and startup](../features/cli-and-options.md)).
6. If the project customizes heft's webpack config (`config/spfx-customize-webpack.js`, `config/webpack-patch.json`), mirror the dev-relevant parts in `fast-serve/vite.extend.mts`; `fast-serve` prints a hint at start until the file exists (see [Customizing the Vite config](../features/vite-extend-file.md)).
7. `npm run serve`, open the printed `open:` URL (it carries the debug query `?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true`), and click **Load debug scripts**.
8. **First time only:** the debug manifest only registers components; a web part or ACE must be added to the page from the toolbox while `fast-serve` runs, and the page saved (on a test page, never on a production page). Extensions load through their serve configuration (`--config <name>`), no page edit needed.

Migrating users from the classic spfx-fast-serve upgrade the project to SPFx 1.24 first, then remove the 1.21 helpers and the old `fast-serve/config.json` (its options map to the new ones) and `fast-serve/webpack.extend.js` (its dev-relevant parts go to `fast-serve/vite.extend.mts`). The new package keeps the `fast-serve/` folder for `config.json` and `vite.extend.mts`; the script name stays `serve`.

### Test projects

Two SPFx projects outside the repository are used for verification; both reference the local tarball.

| Project | What it is | What it covers |
|---|---|---|
| Small SPFx 1.24.1 test project | a generator-style project with `npm run serve` = `fast-serve` and `fast-serve/config.json` pointing at a draft tenant page | one bundle mixing two web parts (one a function component) with an Application Customizer; separate bundles for a ListView Command Set, a Field Customizer, a Form Customizer and an ACE; `config/serve.json` with `default` (Application Customizer), command set, field customizer and New/Edit/View form configurations |
| Large generated benchmark project | a generator writes N modules (default 1000): a deep tree of function components, utilities, barrels and SCSS modules with theme tokens; port 4341; `npm run fast-serve` runs the package | two web parts: a tree web part rendering the whole generated tree, and a PnP web part using Fluent UI, `@pnp/spfx-controls-react` (ListView, PeoplePicker) and `@pnp/sp` with a live REST call; exercises pre-bundling, SPFx libraries used from dependencies, library `.module.scss.css` and page-load performance |

Both contain leftovers from the proof-of-concept era (an unused Vite config and plugin folder; in the benchmark project `npm run serve` still runs the old PoC setup). Use `npm run serve` in the small project and `npm run fast-serve` in the benchmark project.

Tenant test pages are draft pages on a dev site of a dev tenant: one with both small-project web parts (the Application Customizer loads through `default`), one with both benchmark web parts, and a list used for the Command Set, Field and Form Customizer configurations. ACEs were tested in the hosted workbench (`/_layouts/15/workbench.aspx`, retired on 2026-12-01; after that, use a draft page).

### Acceptance checklist (before a release)

With a fresh tarball, live on the tenant (procedure in [Live verification](live-verification.md)):

- small project web parts: render, `[vite] connected.` in the console, theme tokens resolved, TSX hot update keeping state, SCSS swap without reload, web part class edit → full reload;
- Application Customizer and Form Customizer render and hot-update; Command Set via `--config <command set configuration>`;
- ACE: renders, quick view opens, card view edit → reload;
- benchmark project: PnP web part and tree web part render;
- `npm run build` passes in both projects.

The last full run passed on 2026-11-17, with the error overlay verified live on 2026-11-18. The Field Customizer is loaded but never instantiated by this tenant, with `heft start` too (see [Known issues](../limitations/known-issues.md)).

## Links

- [Development workflow and toolchain](development-workflow.md)
- [Live verification on a SharePoint tenant](live-verification.md)
- [Benchmark method](benchmark-method.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Serving web parts, extensions and ACEs](../features/serving-components.md)
- [Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)

## Evidence

- Source: project handoff notes (test projects, tenant pages, acceptance), user docs (install, migration, usage), package manifest, user instruction on tarball naming
- Confidence: high; the exact cause of the stale-tarball gotcha (package manager caching) is medium
- Last checked: 2026-11-19
