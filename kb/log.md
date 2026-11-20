# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-20 13:20 | ingest | Sass ~/pkg: imports like heft, development class-name hash (R27)

- Changed: `kb/features/styles-and-typings.md`, `kb/index.md`, `kb/roadmap/overview.md`
- Outcome: `~` and unresolved `pkg:` imports resolve from the package folder found from the importing file with `exports` ignored (classic `SPFabricCore.scss` template import compiles, nested `~` in imported packages works, dependencies reported for rebuilds); class names now hash the CSS as heft's development webpack sees it (`source-map-loader` removes the source-map comment line), equal to heft's development `dist/` bundles

## 2026-11-20 12:40 | ingest | deep library import warning only for project code (R26)

- Changed: `kb/features/libraries-and-externals.md`, `kb/index.md`, `kb/roadmap/overview.md`
- Outcome: deep imports into SPFx libraries made by dependencies are bundled silently like heft; project-code deep imports warn with the project-relative importing file, one line per request with the first importer and a count of the others

## 2026-11-20 12:10 | ingest | overlay closes after the fix, npm css-loader peer conflict (R25)

- Changed: `kb/features/errors-and-diagnostics.md`, `kb/limitations/npm-css-loader-peer-conflict.md` (new), `kb/features/cli-and-options.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: runtime-error overlay now closes on the first successful update after an edit (also warnings-only builds, which post `webpackWarnings` instead of `webpackOk`) and re-opens when the error repeats; reload after a load failure also follows warnings-only builds; hook-name typos recorded as runtime-only errors; npm `ERESOLVE` with `css-loader` 7.1.2/7.1.3 documented with the `css-loader@^7.1.4` and `--legacy-peer-deps` fixes and why no package-side fix exists

## 2026-11-20 01:21 | ingest | final benchmark (R24)

- Changed: `kb/operations/final-benchmark.md` (new), `kb/roadmap/overview.md`, `kb/features/performance-and-cache.md`, `kb/index.md`
- Outcome: Rspack line vs Vite line vs `heft start` on 100/250/500 generated components recorded (bundled dev mode dropped): heft-level page loads with 3 requests for Rspack, Vite slower from 100 components and growing about 0.47 s per 100, Rspack's start + first render ahead of Vite, Vite's edit loop 3–5× faster, both keep state, heft's two-bundle HMR never applies; recommendation and unmeasured items listed

## 2026-11-20 01:30 | ingest | persistent cache, docs reconcile, acceptance run (R21, R22, R23)

- Changed: `kb/features/performance-and-cache.md` (new), `kb/operations/acceptance-run.md` (new), `kb/features/dev-server.md`, `kb/features/rspack-compile.md`, `kb/features/project-restarts.md`, `kb/features/styles-and-typings.md`, `kb/features/extensions-and-aces.md`, `kb/features/typescript-and-tsconfig.md`, `kb/features/hmr.md`, `kb/references/rspack.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: Rspack persistent cache with a config-and-files fingerprint as version, typings after the first compile and lazily loaded Sass recorded with before/after numbers and the rejected levers; stale "restart needed for now" notes replaced by the restart behaviour; architecture page current; acceptance procedure and the last live results for every component type added

## 2026-11-19 23:55 | ingest | restarts, Rspack extend file, webpack hint, agent skill (R17–R20)

- Changed: `kb/features/project-restarts.md` (new), `kb/features/rspack-extend-file.md` (new), `kb/features/cli-and-options.md`, `kb/architecture/project-model.md`, `kb/references/rspack.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: dev session with content-based restarts (old server kept on failure, pages reload via a per-start hash salt), extend file in every format bundled with Rspack, `defineConfig`/`rspack`/types as the public entry, webpack-merge semantics with dev-server additions, warn-only guard rails, webpack-customization hint and the shipped skill documented; open question on extend formats closed; Rspack facts on ES module output, strict re-export linking and client reconnects added

## 2026-11-19 23:19 | ingest | errors, overlay, terminal output, browser errors, require/AMD (R14, R15, R16)

- Changed: `kb/features/errors-and-diagnostics.md` (new), `kb/features/require-and-amd.md` (new), `kb/features/dev-server.md`, `kb/features/hmr.md`, `kb/features/cli-and-options.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/references/rspack.md`, `kb/index.md`
- Outcome: page runtime in `manifests.js` (single overlay, error forwarding, readable load errors, reload after a failed load), terminal format and short rebuild lines, forwarding rule and source mapping documented with live results; webpack semantics for `require()` and UMD/AMD dependencies recorded as verified (Vite rewrites not needed); Rspack facts on client window messages, per-client overlays, SharePoint re-evaluating failing bundles, line-only maps and RequireJS error shapes added

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
