# KB log

Newest-first history of KB updates. Insert each new entry directly below this section, so the newest entry is first. Keep entries compact: no raw source text, transcripts or superseded facts.

Entry format:

```markdown
## YYYY-MM-DD HH:MM | operation | short summary

- Changed: `kb/path.md`, `kb/other-path.md`
- Outcome: concise result
```

## 2026-11-22 12:30 | update | provided page URL printed with the debug query

- Changed: `kb/features/cli-and-options.md`
- Outcome: when `--page-url` or `"pageUrl"` is given, the start-up box adds `Or open:` with that page and the debug query appended (the extension query for an explicitly selected configuration with extensions); pages from `config/serve.json` aren't printed; `{tenantDomain}` without the environment variable prints a hint (version 1.24.0-beta.17)

## 2026-11-22 12:00 | update | classic config format stops fast-serve

- Changed: `kb/features/cli-and-options.md`
- Outcome: a `fast-serve/config.json` with the classic nested `"serve"` object now stops fast-serve with an "outdated classic format" error naming the flat format, the `$schema` line and the supported options; nothing is converted (version 1.24.0-beta.16)

## 2026-11-22 19:30 | update | minimal startup output (1.24.0-beta.15)

- Changed: `kb/features/dev-server.md`, `kb/features/cli-and-options.md`, `kb/features/extensions-and-aces.md`, `kb/features/errors-and-diagnostics.md`, `kb/features/project-restarts.md`, `kb/features/tunnel-mode.md`, `kb/index.md`
- Outcome: startup prints the versions line, the ready line and a heft-style box with the unencoded web-part debug query (plus the extension query only for an explicitly selected serve configuration with extensions); setup summary, components, page URL, first `compiled in`, ACE and sticky-tab hints dropped from the terminal; tunnel mode prints its ready line and one instruction; verified live: the pasted unencoded query renders both web parts on the test page, and `--config banner`'s unencoded extension query renders the Application Customizer

## 2026-11-22 19:30 | update | JSON schema for `fast-serve/config.json` shipped in the package (`1.24.0-beta.14`)

- Changed: `kb/features/cli-and-options.md`, `kb/index.md`
- Outcome: draft-07 schema in the package, referenced with the relative `../node_modules/spfx-fast-serve-helpers/schema/config.schema.json` (no URL/SchemaStore variant); every option with type, allowed values, default and flags, `additionalProperties: false` with `$schema` allowed; schema properties kept equal to the reader's option list by a test; the classic nested `"serve"` object is ignored with a warning that prints the flat equivalent; unknown-key errors and the help text show the `$schema` line

## 2026-11-22 19:00 | update | port in use at start: ask to stop the process holding it (`1.24.0-beta.13`)

- Changed: `kb/features/dev-server.md`, `kb/features/cli-and-options.md`
- Outcome: in an interactive terminal a busy port at start names its owner (pid, name, shortened command line) and Enter stops it (SIGTERM / `taskkill`, forced after 3 s, port awaited up to 5 s more) while Ctrl+C, Ctrl+D or end of input exit 1 without stopping anything; no prompt without a TTY, for an unidentified owner, for fast-serve's own process or parent, or on restarts; owner lookup with `netstat`/`tasklist` on Windows and `lsof` (Linux fallback `ss`) plus `ps` elsewhere, no new dependency, no option

## 2026-11-22 18:45 | update | type check on by default, one overlay at a time, no duplicate syntax errors (`1.24.0-beta.12`)

- Changed: `kb/features/type-checking.md`, `kb/features/cli-and-options.md`, `kb/features/errors-and-diagnostics.md`, `kb/features/typescript-and-tsconfig.md`, `kb/index.md`
- Outcome: `typeCheck` and `typeCheckOverlay` default to `true` (new `--no-type-check-overlay`; no tsconfig/TypeScript is one info line); type issues in files the compiler can't build are left to the compile error (syntactic diagnostics kept, because type-only files have no other syntax check); the type panel collapses to a one-line bar while the compile or runtime overlay is open (window event plus the overlay's fixed element id; click expands until the overlay changes; Esc in the capture phase); live SharePoint result recorded

## 2026-11-22 15:00 | ingest | linting saved files (`1.24.0-beta.11`)

- Changed: `kb/features/linting.md` (new), `kb/features/cli-and-options.md`, `kb/features/type-checking.md`, `kb/features/errors-and-diagnostics.md`, `kb/architecture/overview.md`, `kb/index.md`
- Outcome: lint feature documented (`lint` option and flags, default on with type-aware rules off, `"full"`, project ESLint 9 and flat config per code root in one child process warmed after the first compile, lint after rebuilds, terminal-only output on change, config reload, extend-file linter wins, lifecycle); parity with heft on 16 planted issues, local numbers and the live SharePoint result recorded

## 2026-11-22 14:30 | ingest | background type check with the project's TypeScript (`1.24.0-beta.10`)

- Changed: `kb/features/type-checking.md` (new), `kb/features/cli-and-options.md`, `kb/features/errors-and-diagnostics.md`, `kb/features/typescript-and-tsconfig.md`, `kb/features/styles-and-typings.md`, `kb/architecture/overview.md`, `kb/index.md`
- Outcome: opt-in `typeCheck`/`typeCheckOverlay` (flags `--type-check`, `--no-type-check`, `--type-check-overlay`) documented: `ts-checker-rspack-plugin` `~1.8.0` with the project's TypeScript 5 on the unchanged tsconfig plus incremental info, first check held until the first compile, generated typings fed into the next check, terminal blocks only on changed issue sets, page panel over an event stream, extend-file checker wins, consumer project only; local numbers on both test projects and the live SharePoint result recorded

## 2026-11-22 12:00 | update | SCSS typings written only on change, quiet no-op rebuilds, typings updates channel (`1.24.0-beta.9`)

- Changed: `kb/features/styles-and-typings.md`, `kb/features/errors-and-diagnostics.md`, `kb/features/dev-server.md`, `kb/features/performance-and-cache.md`, `kb/architecture/overview.md`, `kb/references/rspack.md`
- Outcome: heft's Sass processor now writes into a staging folder with its incremental cache, and typings (SCSS and static assets) are published atomically only when their content differs, so starts and edits keep unchanged typings' timestamps; rebuilds that change no module output (file saved without changes, type-only watched file, invalidation) print nothing unless problems change, with module output compared by source hash because module hashes include the per-start salt and failed modules rebuild every time; the page channel announces written and removed typing files for a later type check

## 2026-11-22 00:30 | update | externals survive a syntax error and its fix; Windows watch ignore (`1.24.0-beta.8`)

- Changed: `kb/features/libraries-and-externals.md`, `kb/features/rspack-compile.md`, `kb/references/rspack.md`
- Outcome: cause of "`escape` is not a function" after a syntax error and its fix recorded (the failed build drops an external used only by the broken module; the fixed build's hot update re-ships it with a factory that can't see the `define` parameter); fix recorded (each bundle's hot-update handler puts its original external factories back); the watcher ignore pattern now matches Windows paths, which watchpack tests with forward slashes

## 2026-11-20 23:50 | update | render errors in JSX no longer silent (`1.24.0-beta.6`)

- Changed: `kb/features/errors-and-diagnostics.md`
- Outcome: two causes of silent render errors recorded and fixed: frames on unmapped JSX development lines (V8 reports a JSX child's `ReferenceError` at `__self: this`) now map to the next mapped line inside the same module; served bundles are loaded by RequireJS with `crossorigin="anonymous"` so errors from the initial bundle are no longer muted as `Script error.`; live results for class and function components and the heft comparison added

## 2026-11-20 23:30 | update | Rspack implementation is the main v1.24 line (`1.24.0-beta.5`)

- Changed: `kb/AGENTS.md`, `kb/index.md`, `kb/decisions/rspack-with-own-config.md`, `kb/roadmap/overview.md`, `kb/operations/final-benchmark.md`, `kb/limitations/npm-css-loader-peer-conflict.md`
- Outcome: the KB now describes the main v1.24 line, versioned `1.24.0-beta.<n>` from `1.24.0-beta.5` and published under the npm `beta` tag; the Vite implementation (earlier betas up to `1.24.0-beta.3`) is kept on branch `vite` as history with its own KB; the publishing question is closed; `1.24.0-rspack.<n>` mentions stay as history

## 2026-11-20 22:30 | ingest | tunnel mode with TunnelServePlugin (T1, `1.24.0-rspack.19`)

- Changed: `kb/features/tunnel-mode.md` (new), `kb/features/errors-and-diagnostics.md`, `kb/features/dev-server.md`, `kb/features/localization.md`, `kb/features/rspack-extend-file.md`, `kb/architecture/overview.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: classic manual tunnel flow documented (user-run tunnel, heft development package, marker plugin, public origin vs listen origin, websocket on 443, `no-store` bundles, mobile cache clearing, banner); heft's development package file names recorded (strings `<Name>_<locale>.js`, local externals `<name>_<md5>.<ext>`) and answered; page runtime now also the first module of every bundle; local end-to-end through a Cloudflare quick tunnel and the live normal-flow regression check recorded; ACE `@microsoft/sp-property-pane` listing gap noted

## 2026-11-20 20:40 | ingest | errors while a module is evaluated open the overlay (R28, `1.24.0-rspack.18`)

- Changed: `kb/features/errors-and-diagnostics.md`, `kb/features/hmr.md`, `kb/roadmap/overview.md`
- Outcome: a component that throws at its top level during a hot update was caught by Fast Refresh's error handler and logged with `console.error` (terminal only, page unchanged, old version still rendering); now an `Error` logged while a bundle is in the HMR `apply` phase is reported as a failed update with the overlay and a stale-page note; bundle load failures caused by project code open the overlay too; frames on generated lines without a mapping are no longer attributed to the preceding module. Plain `console.error` (also with `Error` objects) stays terminal-only

## 2026-11-20 19:30 | ingest | hosted workbench removed (`1.24.0-rspack.17`)

- Changed: `kb/concepts/sharepoint-debug-flow.md`, `kb/concepts/spfx-component-types.md`, `kb/features/extensions-and-aces.md`, `kb/features/dev-server.md`, `kb/features/cli-and-options.md`, `kb/operations/acceptance-run.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: the site workbench URL in the ACE banner, its 4321 probe quirk and the workbench as a host removed (Microsoft retires the SharePoint Online workbench on December 1, 2026); ACEs documented with Microsoft's page-based flow (toolbox in edit mode, interaction on a saved page in read mode) and the web-part query line for serve configurations with extensions; a page URL pointing to the workbench is ignored with a warning

## 2026-11-20 19:30 | refactor | architecture review items 1–3 (1.24.0-rspack.16)

- Changed: `kb/architecture/overview.md`, `kb/architecture/project-model.md`, `kb/features/rspack-compile.md`, `kb/features/local-library-projects.md`, `kb/features/project-restarts.md`, `kb/index.md`
- Outcome: feature API separated from the composition root (no folder cycles, cross-folder imports through public entry modules); one named feature shape, a page channel (page reload, page script parts, server-started hooks) and explicit merge order documented; project model now has code roots, consumer/library roles and read-once caching; the stale in-place invalidation description removed. Behaviour unchanged (same terminal output and served files on a spfx-rea copy, live checks passed)

## 2026-11-20 15:40 | ingest | local library component projects compiled from source (L1–L4)

- Changed: `kb/features/local-library-projects.md` (new), `kb/architecture/project-model.md`, `kb/features/libraries-and-externals.md`, `kb/features/cli-and-options.md`, `kb/features/project-restarts.md`, `kb/features/typescript-and-tsconfig.md`, `kb/features/hmr.md`, `kb/features/errors-and-diagnostics.md`, `kb/concepts/spfx-component-types.md`, `kb/operations/acceptance-run.md`, `kb/roadmap/overview.md`, `kb/index.md`
- Outcome: linked library projects detected and compiled from `src` in the consumer (aliases, loc, tsconfig `paths`, merged `config.json` externals, refresh include, per-root const enum/type-only checks, project-code treatment for warnings, problems, rebuild lines and browser errors, class-option warning, restart triggers); `deployedLibraries` opt-out; library-only message; live table on a generated library + spfx-rea copy (Fast Refresh across projects 102–113 ms with state, SCSS swap with tenant theme token, loc hot update, restart on library config, errors with `../corp-lib/…` paths, cached start)

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
