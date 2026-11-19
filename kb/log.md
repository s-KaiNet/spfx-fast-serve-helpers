# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-20 00:30 | ingest | Sass/CSS modules, typings, tsconfig (R11, R12, R13)

- Changed: `kb/features/styles-and-typings.md` (new), `kb/features/typescript-and-tsconfig.md` (new), `kb/features/rspack-compile.md`, `kb/architecture/project-model.md`, `kb/references/rspack.md`, `kb/references/spfx-heft-pipeline.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: heft's exact class-name hash input recorded (lib CSS path plus the Sass plugin's source-map comment) and matched; `pkg:`/`~`/`loadPaths`/deprecation settings, global and library CSS, theme tokens, SCSS and asset typings while serving documented; tsconfig-derived SWC options, `paths` via Rspack's tsconfig resolver, type-only warning filter and `const enum` errors documented with the reasons; Rspack facts on linking warnings, module graph access, rule-level `tsConfig` and SWC decorator options added

## 2026-11-19 23:55 | ingest | SPFx libraries, config.json externals, localization (R8, R9, R10)

- Changed: `kb/features/libraries-and-externals.md` (new), `kb/features/localization.md` (new), `kb/features/rspack-compile.md`, `kb/features/dev-server.md`, `kb/features/hmr.md`, `kb/concepts/externals-semantics.md`, `kb/references/rspack.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: library and `config.json` externals with heft-format per-bundle manifest entries, local externals served under `/dist/`, webpack import semantics verified (incl. `export *`), deep imports bundled like heft after the root-mapping attempt broke default imports, reloads for external-list changes and local external edits; localization with module loc wrapper, heft warning, `--locale` for library strings, hot update vs reload; Rspack facts on externals in hot updates, `finishModules`/`rawRequest` and `static-changed`

## 2026-11-19 21:52 | ingest | extensions and ACEs (R6, R7)

- Changed: `kb/features/extensions-and-aces.md` (new), `kb/features/cli-and-options.md`, `kb/features/dev-server.md`, `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/spfx-component-types.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: serve configuration selection, extension query and startup warnings documented; ACE handling (manifest, JSON templates, images, lazy chunks with hoisted libraries, reload on edits), ACE banner hint and site workbench URL recorded; hosted workbench's fixed `localhost:4321` probe warning noted; live results for Application Customizer, Command Set, Form Customizer and the ACE added

## 2026-11-19 21:40 | ingest | HMR and React Fast Refresh (R5)

- Changed: `kb/features/hmr.md` (new), `kb/decisions/several-bundles-one-compilation.md` (new), `kb/features/dev-server.md`, `kb/features/rspack-compile.md`, `kb/references/rspack.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: HMR behaviour, refresh loader and per-bundle refresh entry, hot-update fan-out for several bundles, hot styles, `no-store` hot-update files and live edit → DOM times recorded; one compilation chosen over `MultiCompiler` with measurements; Rspack facts on the runtime-module hook, the refresh plugin's injection flag, `hot.data` and hidden-tab throttling added; the open question on several bundles closed

## 2026-11-19 23:30 | ingest | dev server, debug manifests, debug URL (R4)

- Changed: `kb/features/dev-server.md` (new), `kb/features/cli-and-options.md`, `kb/features/rspack-compile.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/references/rspack.md`, `kb/index.md`
- Outcome: HTTPS dev server, in-memory `/dist/`, own `manifests.js` (per-bundle library resources from the compile, `sp-loader`, port-correct), icons, CORS/PNA, ready banner, port check and shutdown documented; interim one-shot compile removed; `@rspack/dev-server` host-check, listen-error, middleware-order and exit-signal facts recorded; live result on spfx-rea (two web parts and the Banner customizer, three requests per page load)

## 2026-11-19 22:00 | ingest | Rspack compile (R3)

- Changed: `kb/features/rspack-compile.md` (new), `kb/features/cli-and-options.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/references/rspack.md`, `kb/references/spfx-heft-pipeline.md`, `kb/index.md`
- Outcome: own Rspack config documented (contributions, AMD output, virtual entries, externals, React alias, SWC defaults, initial loc/assets/styles/defines); Rspack 2 needs `amd: {}` for AMD parsing; async-chunk externals hoisted by Rspack; heft's first-bundle named `define` quirk and async-loader dependency recorded; structure comparison with heft and compile times added

## 2026-11-19 21:00 | ingest | CLI and options, project model (R1, R2)

- Changed: `kb/features/cli-and-options.md` (new), `kb/architecture/project-model.md` (new), `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: CLI options, precedence, startup order, failures and the interim "not implemented" exit documented; project model facts, invalidation and the snapshot check against heft recorded; `amdPackages` ignored with a warning; `@microsoft/microsoft-graph-client` in the model as heft's library without a manifest, React family deliberately not

## 2026-11-19 20:30 | setup | fresh KB for the Rspack implementation

- Changed: `kb/AGENTS.md`, `kb/index.md`, `kb/log.md`, `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/component-manifests-and-loader.md`, `kb/concepts/spfx-component-types.md`, `kb/concepts/externals-semantics.md` (new), `kb/references/spfx-heft-pipeline.md`, `kb/references/rspack.md` (new), `kb/architecture/overview.md` (new), `kb/decisions/rspack-with-own-config.md` (new), `kb/roadmap/overview.md` (new)
- Outcome: the Vite implementation's KB replaced by a separate KB; bundler-independent concepts and the heft pipeline reference carried over and reworded where the bundler matters; heft's bundle format corrected to an anonymous AMD module (checked against heft's config and production output); new pages for the own-config decision, target architecture, roadmap phases, externals semantics and Rspack facts
