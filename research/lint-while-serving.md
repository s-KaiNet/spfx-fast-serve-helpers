# Linting changed files while serving: eslint-rspack-plugin vs our own runner, full vs type-aware rules off (spike, 2026-11-21)

Research only, nothing in `src/` changed. Prototypes, raw results and logs are in `/var/tmp/lint-research/` (`proto/`, `results/`, `plants/`).

## TL;DR

- **The SPFx 1.24 profile has 93 active rules for `.tsx` files and 94 for `.ts` files. Only 2 of them need type information** (`@typescript-eslint/no-floating-promises`, `@typescript-eslint/no-for-in-array`, both `error`). That's the same in all three projects (same `eslint.config.js`). No other plugin in the profile (Rushstack, Rushstack security, SPFx, react, promise) has a rule that needs types. The `react-hooks` plugin is registered, but **none of its rules are turned on** in the SPFx profile, so neither heft nor fast-serve reports hook mistakes.
- **Variant B (type-aware rules off) is 3× cheaper and reports exactly heft's results minus those 2 rules.** On 16 planted issues heft reports 16, A reports the same 16 (same file:line:col and rule), and B reports 14. B has **no false positives**, and no "requires type information" failure on any file of the three projects.
- **eslint-rspack-plugin 5.0.1 isn't usable as is.** It works with Rspack 2 (peer `^1.0.8 || ^2.0.0`), but it **awaits ESLint inside `processAssets`**, so every lint delays the rebuild and the hot update. The first save after start adds **3.6–4.9 s with A** and **0.34–0.44 s with B**, and every later save adds about 15–35 ms. v5 removed `threads` (the only alternative is ESLint's own `concurrency`, which doesn't help for 1 file). ESLint runs in the server process (peak RSS +170 MB with B, +430–470 MB with A). Results become Rspack compilation warnings, which means our compile report and the browser's `webpackWarnings` message. By default it only lints `*.js`. Files that are only imported as types are never linted.
- **Our own runner** (ESLint Node API in a forked child process, fed by a recursive `fs.watch` on `src`, started after the Rspack `done` of the change) **doesn't change rebuild times**: rebuild and `seal→processAssets` medians are the same as with lint off. With B, save → warning printed takes **103–180 ms** (worker time 10–55 ms; the rest is our 50 ms debounce plus waiting for the rebuild). The first save takes 1.15–1.28 s with a cold worker, or **145–244 ms** if the worker starts and loads the config right after the first compile (≈1.3 s of background work, ≈220 MB). Startup cost is 0. Type-only files are linted too.
- **Recommendation: on by default, with variant B, through our own runner.** Option `"lint": true | false | "full"` in `fast-serve/config.json` (default `true` = B, `"full"` = A), CLI `--no-lint` / `--lint full`. Warnings go to the terminal only. They never become Rspack errors, never reach the overlay, and never block a rebuild. Effort **M** (on the small side). The main risk: B can't catch `no-floating-promises`/`no-for-in-array`, which are **errors that fail `heft build`**. `"full"` covers that, at a cost of 4–5 s CPU at the first save and ~600 MB.

## Setup

- Same laptop as [type-check-while-serving.md](type-check-while-serving.md): i7-7500U (2 cores / 4 threads), 22 GB RAM, Linux, Node 24.21.0.
- fast-serve `1.24.0-beta.7` (tgz from `v1.24`) in copies `/var/tmp/lint-research/{rea,b500,bench}`. Projects: spfx-rea (22 `.ts/.tsx` in `src`), bench-500 (579), spfx-bench (1006). All three are lint-clean with A and B. ESLint 9.37.0, `@microsoft/eslint-config-spfx` 1.24.1, `@typescript-eslint/*` 8.56.1, heft 1.3.2 with `@rushstack/heft-lint-plugin` 1.3.1.
- **CPU contention:** the parallel TS-diagnostics thread ran 3–4 `npm ci` plus `tsc` processes during my setup (load average 15–24 on 4 threads, heavy I/O wait). Runs from that window were 5–10× slower and are discarded (kept as `results/oneshot-loaded.txt`, `server-trial*.jsonl`). **Every number below was taken between 23:43 and 00:05, at load 0.5–3.**
- Harness (`proto/`): `rspack.extend.mjs` (added through the extend file, mode from `LINTMODE`): `[mark]` lines at Rspack `watchRun`, `seal`, `afterProcessAssets` and `done`, plus either the plugin or our runner (`lint-worker.mjs`, a forked child). `variant.mjs` builds the ESLint options for A/B. `serverbench.mjs` runs a real `fast-serve`, makes 3 rounds of 4 edits (leaf component string; optional field added to a widely used type file; an unused `const` appended to the leaf = a lint issue; the issue removed again) and samples the RSS of the server and its child processes every 200 ms. `oneshot.sh`: CLI timings. `summarize.mjs`: medians.
- B is set up without touching the project's config: ESLint `overrideConfig: [{ ...tseslint.configs['flat/disable-type-checked'], files: ['**/*.ts', '**/*.tsx', '**/*.mts', '**/*.cts'] }]`, with `@typescript-eslint/eslint-plugin` resolved from `@microsoft/eslint-config-spfx`. For the CLI, the same thing is in `proto/eslint.config.b.cjs`.
- Medians of the non-first saves: rea 8 saves that rebuild (the rea type file is type-only, so it doesn't rebuild), b500/bench 11. "First save" is the first edit after start (n=1 per session; it repeated within ±10% in the trial runs).

## 1. Rules

| | rea | b500 | bench |
|---|---|---|---|
| Active rules (`.tsx` / `.ts`) | 93 / 94 | 93 / 94 | 93 / 94 |
| By plugin (`.ts`) | core 59, `@typescript-eslint` 12, react 16, `@rushstack` 4, `@rushstack/security` 1, promise 1, `@microsoft/spfx` 1 | same | same |
| Type-aware (`meta.docs.requiresTypeChecking`) | `no-floating-promises` (error), `no-for-in-array` (error) | same | same |
| Other rules that read `parserServices` without the flag | none found (source scan of each rule's `create`) | none | none |
| B on the whole `src` + the plants | 0 failures | 0 failures | 0 failures |

How to turn off type-aware rules generically, without knowing the config (both checked):
1. **By metadata:** `calculateConfigForFile` → for each active `plugin/rule`, look up `config.plugins[plugin].rules[rule].meta.docs.requiresTypeChecking`, and override those rules to `off` along with `parserOptions: { project: false, projectService: false, program: null }`. On rea this finds the same 2 rules and gives the same 14 results as `flat/disable-type-checked`. This doesn't need `@typescript-eslint/eslint-plugin` to be resolvable.
2. **Fallback by catching the error:** if a type-aware rule is still on without a program, ESLint throws `Error while loading rule '<id>': You have used a rule which requires type information…`. The rule id is in the message, so the runner can turn that rule off and retry. This covers plugins that don't set the flag.

## 2. Speed

### One-shot `eslint src` and heft's lint step (s / peak RSS MB, median of 3)

| Project | A no cache | A `--cache` cold | A `--cache` warm | B no cache | B `--cache` cold | B `--cache` warm | heft lint step, clean build | heft lint step, unchanged rebuild |
|---|---|---|---|---|---|---|---|---|
| rea | 3.38 / 535 | 3.28 / 535 | 0.89 / 221 | 1.14 / 239 | 1.13 / 249 | 0.90 / 217 | 1.69 (38 files) | 1.23 (0 files) |
| b500 | 6.58 / 1072 | 6.72 / 1112 | 0.99 / 230 | 3.86 / 581 | 3.93 / 578 | 1.01 / 232 | 10.1 (627 files) | 4.50 (0 files) |
| bench | 8.82 / 1515 | 8.89 / 1516 | 1.04 / 251 | 5.57 / 607 | 5.67 / 607 | 1.04 / 249 | 13.3 (1054 files) | 5.08 (0 files) |

Heft's lint runs after its TypeScript task and reuses that `ts.Program` (`parserOptions.programs`), alongside webpack. It also lints extra files the config selects (the `loc/*.js` files, hence 38 > 22). Its own cache still costs 1.2–5 s on an unchanged project, because it hashes every file's computed config. The full heft build took 6.5–7 s (rea), 23–24 s (b500) and 32–33 s (bench).

### Inside fast-serve (ms after the save; medians)

| Project | Mode | Rebuild done (hot update ready) | `seal→processAssets` | First save: rebuild / warning printed | Later saves: warning printed | Worker time per lint | Peak RSS server / child processes¹ |
|---|---|---|---|---|---|---|---|
| rea | off | 65 | 36 | 60 / – | – | – | 340 / 16 |
| rea | plugin B | 105 | 66 | **339** / 339 | 105 (= rebuild) | – | 512 / 21 |
| rea | plugin A | 133 | 88 | **3609** / 3609 | 133 (= rebuild) | – | 773 / 16 |
| rea | runner B | 93 | 50 | 63 / 1154 | 112 | 13–21 | 330 / 236 |
| rea | runner B, worker pre-started | 91 | 46 | 63 / 145 | 103 | 18–25 | 329 / 237 |
| rea | runner A | 54 | 27 | 62 / 3670 | 103 | 37–46 | 331 / 555 |
| rea | runner A, program pre-built | 53 | 26 | 61 / 111 | 102 | 30–52 | 329 / 554 |
| b500 | off | 75 | 35 | 123 / – | – | – | 603 / 24 |
| b500 | plugin B | 93 | 50 | **443** / 443 | 93 | – | 666 / 40 |
| b500 | plugin A | 120 | 69 | **4677** / 4677 | 120 | – | 981 / 106 |
| b500 | runner B | 95 | 36 | 102 / 1226 | 138 | 23–29 | 564 / 253 |
| b500 | runner A | 95 | 36 | 107 / 4212 | 169 | 35–58 | 578 / 624 |
| bench | off | 96 | 41 | 121 / – | – | – | 636 / 138 |
| bench | plugin B | 128 | 52 | **422** / 422 | 128 | – | 755 / 133 |
| bench | plugin A | 118 | 74 | **4855** / 4855 | 118 | – | 1052 / 125 |
| bench | runner B | 122 | 47 | 127 / 1276 | 174 | 11–55 | 663 / 270 |
| bench | runner B, worker pre-started | 125 | 48 | 139 / 244 | 180 | 15–42 | 665 / 274 |
| bench | runner A | 107 | 41 | 122 / 4445 | 193 | 53–74 | 642 / 657 |
| bench | runner A, program pre-built | 128 | 44 | 137 / 251 | 193 | 46–63 | 631 / 674 |

¹ Child processes include `sass-embedded`'s Dart process (16–138 MB, see "off"). The lint worker alone is ≈220–230 MB with B and ≈540–610 MB with A. With plugin B the server's idle RSS is already +150 MB before any lint, because the B option builder loads `@typescript-eslint/eslint-plugin` (and with it `typescript`) in the server process.

- **Startup:** with `lintDirtyModulesOnly` (plugin) or a lazy worker (runner), nothing is linted at start. Time to the first `done` from process start (n=1 per mode, cached): rea off 1248, plugin A 1358, runner B 1239, runner A 1246 ms; b500 off 3297, A/B runner 2100–2186, plugin A 2141 ms; bench off 3630, others 2536–3299 ms. The off sessions ran first after the heft builds, so they're the slowest. Plugin B at rea (2008 ms) includes loading `@typescript-eslint/eslint-plugin` + `typescript` in the server for the B override (a harness artefact; a worker avoids it). Overall: no measurable startup cost. Pre-starting the worker after the first compile runs in the background: about 1.3 s for B (start + `calculateConfigForFile`) and 4.3–4.5 s for A (lint one file to build the TS program). Those times are measured from the worker starting until it's ready, and nothing waits for it.
- **Rebuild effect:** the plugin's lint is on the critical path. `seal→processAssets` grows by 15–35 ms per later save (B 11–30, A 33–52), and the first save is blocked for the whole ESLint startup. The runner starts after `done`, and its rebuild medians fall inside the off spread (the 4-edit noise is about ±30 ms).
- **Edit kinds:** with dirty-only linting both engines lint only the saved file, so a leaf edit, an edit to the widely used `types.ts` and an edit with an issue all cost the same (worker 10–75 ms). Files that depend on a changed type aren't re-linted. That only matters for type-aware rules (A), and heft catches those.
- **Type-only files:** rea's `IHelloWorldProps.ts` is only imported as `import type`, so a save doesn't rebuild and **the plugin never lints it**. The runner (file watcher) does: 61 ms (B), 98 ms (A). In bench/b500, `types.ts` is in the graph (normal `import { INodeProps }`), and both engines lint it.
- **Issue reported:** every "issue in" save gave exactly 1 warning (`@typescript-eslint/no-unused-vars`) in all modes, and the fix gave 0. (The plugin's warning count in `server.jsonl` reads 0 for some saves because of a harness race: the mark line arrived in a second stdout chunk. The logs show 3/3 warnings in every plugin session.)

## 3. Parity with heft

16 issue kinds were planted in `src/plants/LintPlants.tsx` and `src/plants/plantTypes.ts` (type-only import) in the rea copy. The plants type-check, so heft's TypeScript task passes and lint runs. Heft output: `results/heft-plants.log`. A/B: `results/plants-{A,B}.txt`.

| Plant | Rule | heft build | A | B |
|---|---|---|---|---|
| unused local | `@typescript-eslint/no-unused-vars` (warn) | ✓ | ✓ | ✓ |
| `==` | `eqeqeq` (warn) | ✓ | ✓ | ✓ |
| floating promise | `@typescript-eslint/no-floating-promises` (**error**, type-aware) | ✓ | ✓ | **–** |
| `for…in` over an array | `@typescript-eslint/no-for-in-array` (**error**, type-aware) | ✓ | ✓ | **–** |
| `any` parameter | `@typescript-eslint/no-explicit-any` (warn) | ✓ | ✓ | ✓ |
| `any` in a type-only imported file | `@typescript-eslint/no-explicit-any` | ✓ | ✓ | ✓ |
| missing return type | `@typescript-eslint/explicit-function-return-type` (warn) | ✓ | ✓ | ✓ |
| `void promise` | `no-void` (warn) | ✓ | ✓ | ✓ |
| `let` never reassigned | `prefer-const` (warn) | ✓ | ✓ | ✓ |
| `var` | `no-var` (**error**) | ✓ | ✓ | ✓ |
| `string \| null` return | `@rushstack/no-new-null` (warn) | ✓ | ✓ | ✓ |
| `debugger` | `no-debugger` (warn) | ✓ | ✓ | ✓ |
| `record['known']` | `dot-notation` (warn) | ✓ | ✓ | ✓ |
| empty `catch` | `no-empty` (warn) | ✓ | ✓ | ✓ |
| use before define | `@typescript-eslint/no-use-before-define` (**error**) | ✓ | ✓ | ✓ |
| `map` without `key` | `react/jsx-key` (warn) | ✓ | ✓ | ✓ |
| hook inside `if` | `react-hooks/rules-of-hooks` (not enabled) | – | – | – |
| missing effect dependency | `react-hooks/exhaustive-deps` (not enabled) | – | – | – |

Totals: heft 16 (4 errors, 12 warnings; the build **fails** because of the errors), A 16 (identical file:line:col and rule), B 14. **B reports nothing heft doesn't.** Its only gaps are the two type-aware rules. Both engines call the same ESLint API, so the plugin and the runner report the same messages for the same files. The difference is which files get linted: the plugin skips the type-only file.

## 4. eslint-rspack-plugin 5.0.1 vs our runner

| | eslint-rspack-plugin 5.0.1 | Our runner |
|---|---|---|
| Rspack 2 / ESLint 9 | yes (peers `@rspack/core ^1.0.8 \|\| ^2.0.0`, `eslint ^9 \|\| ^10`), flat config by default, published 2026-05-29 | uses the project's `eslint` (the same one heft uses) |
| Blocks the rebuild | **yes**: `processAssets.tapPromise` awaits the lint; first save +0.3–0.45 s (B) / +3.6–4.9 s (A) | no: starts after `done`, in another process |
| Where ESLint runs | the server process (a new `ESLint` instance per compilation; `threads` removed in v5, ESLint's `concurrency` is the replacement) | one long-lived child process; the TS program (A) stays warm |
| Startup with dirty-only | 0 (skips the first `watchRun`) | 0 (lazy) or a background warm-up after the first compile |
| Which files | `compilation.builtModules` that match `files` (default `extensions: 'js'`, so `.ts/.tsx` need `files: ['src/**/*.{ts,tsx}']`); type-only files are never seen | our watcher on each code root (any `.ts/.tsx`, `.d.ts` skipped, `isPathIgnored` respected) |
| Results | `compilation.warnings` / `errors` (`severity: { error: 'warning' }` is needed, otherwise ESLint errors such as `no-floating-promises` become **compile errors → overlay**). Our compile report prints a location-less `warning` block (Rspack's `⚠ [eslint] │ …` box around stylish output) and `rebuilt in … ms: 1 warning`; the dev server sends `webpackWarnings` to the page (the HMR client logs them in the browser console) | structured messages → our own terminal block; nothing goes into the compilation, the page channel or the overlay |
| Restarts | part of the compiler; a new session = a cold ESLint again (first save pays the startup) | killed in `watchClose`/stop, started again lazily or warm |
| Install | 728 KB, 10 packages (`micromatch`, `tinyglobby`, `normalize-path` and their dependencies) | none (ESLint is the project's) |

Our compile report and HMR are built on Rspack stats, so routing lint through the compilation would mix it into the "rebuilt" line and the page messages. The runner keeps lint out of both.

## 5. Integration notes

- **Engine:** `src/lint/` (feature folder; it contributes a compiler plugin that only taps `watchRun`/`done`/`watchClose`): `worker.ts` (forked with `child_process.fork`, IPC: `{ files }` → `{ results }`), `runner.ts` (per-root watcher → queue, 50 ms debounce, flush only when no compile is running, i.e. after `done`; one lint in flight, changes during a lint are queued; `.d.ts` and files outside the code roots skipped), `typeAware.ts` (B override: `requiresTypeChecking` rules off + `parserOptions.project/projectService/program` off, retry on "requires type information"), `report.ts`.
- **Terminal output** (same layout as `formatCompileProblems`, printed after the compile report): `lint: 1 warning (src/…/Second.tsx)` + `warning in src/…/Second.tsx:17:7` / `no-unused-vars 'x' is assigned a value but never used.` ESLint errors are printed with an `error` label but are still lint output, never compile errors. Print only for files that have issues, plus one `lint: src/… clean` line when a file that had issues is clean again. Never send to the page, never count in `rebuilt in … ms: N warnings`.
- **When ESLint isn't there:** no `eslint` that the project can resolve, or no `eslint.config.{js,cjs,mjs}` → lint is off, with a single info line. Legacy `.eslintrc` (pre-1.22 projects) isn't supported (SPFx 1.24 uses flat config). A crashed worker is reported once and lint stays off for the session (no restart loop).
- **Config changes:** add `eslint.config.*` to the session's watched files, but restart **only the worker**, not the whole session.
- **Restarts and the extend file:** the session restart already closes the compiler, and `watchClose` kills the worker. If the extend file adds its own `ESLintRspackPlugin`, warn that both are running and suggest `"lint": false`.
- **Library roots:** `codeRoots()` includes linked library projects. ESLint 9 resolves the flat config from `cwd` (lookup from each file only with the `unstable_config_lookup_from_file` flag; that's the default in ESLint 10). So use one `ESLint` instance per code root (`cwd` = that root, that root's `eslint`), and skip roots without a config. They can share the one worker process.
- **ESLint cache:** not needed for dirty-only linting (every lint is of a changed file). With A it would even be wrong for dependents of a changed type. Leave it off and don't write files.
- **Windows (from the docs, not tested here):** `fs.watch` with `recursive` and `child_process.fork` are supported on Windows/macOS (the session already uses recursive watching). Paths from the watcher come with `\` and must be resolved to absolute paths before calling `lintFiles`. ESLint matches flat-config `files`/`ignores` relative to `cwd` on every OS. The plugin normalizes paths with `normalize-path`/`micromatch`; its Windows behaviour wasn't checked.

## 6. Recommendation

**On by default, with variant B, through our runner.**

- B costs ~10–55 ms of worker time per save, ~220 MB, zero startup and zero rebuild impact. It reports everything heft reports except the two type-aware rules, and it never adds a false positive. Pre-start the worker in the background once the first compile is done (after the ready banner), so even the first save is printed in 0.15–0.25 s.
- A (`"full"`) through the same runner: per save it's the same as B (100–200 ms printed), but the first save pays 3.7–4.4 s to build the TS program (or 4.3–4.5 s of background CPU if pre-built), and the worker uses 540–610 MB. That's worth it only for people who want `no-floating-promises` while serving. Note also that heft runs the full lint on every build anyway.
- Not the plugin: it blocks hot updates (seconds with A), runs in the server process, mixes lint into the compilation/report/page channel, and misses type-only files.

**Option shape:** `fast-serve/config.json` `"lint": true | false | "full"` (default `true`); CLI `--no-lint`, `--lint` / `--lint full`; flags win as usual. Maybe later `"lint": { "mode": "full", "roots": … }` if library roots need different settings.

**Effort: M (on the small side).** About 4 small modules + option plumbing, unit tests (options, type-aware override including the catch-and-disable fallback, formatter, queue sequencing after `done`), and one integration test that runs the real ESLint on a fixture with a flat config and a planted issue (fixture needs `eslint` + `typescript-eslint` as dev dependencies of the test). README/KB updates.

**Risks**

- B misses `no-floating-promises` / `no-for-in-array`. Those are **errors** that fail `heft build`, so a user could see a clean serve and then a failing build. Mitigations: `"full"`, and mention it in the README. Projects that turn on more type-aware rules lose more with B (the override handles any number of them).
- The project's ESLint runs inside our process tree: custom plugins with side effects, slow configs, very large configs. That's contained by the worker. If loading the config fails, show the error once and turn lint off.
- Memory: +220 MB (B) / +600 MB (A) for the session. On an 8 GB machine A could matter, so it's opt-in only.
- Dirty-only means dependents aren't re-linted. That only affects type-aware results, i.e. A.
- ESLint 10 (config lookup from the file by default, removed APIs) needs a check when SPFx moves to it. `loadESLint`/`ESLint` and `isPathIgnored` are stable APIs.
- Windows/macOS not measured in this spike.

## Reproduce

`/var/tmp/lint-research/proto/`: `rules.mjs <project> <file>` (rule census), `oneshot.sh <project>` (CLI A/B × no cache/cold/warm → `results/oneshot.txt`), `serverbench.mjs <project> off|pA|pB|rA|rB <runs> <port>` (needs `fast-serve/rspack.extend.mjs` from `proto/` and `lint-targets.json` in the copy; `LINT_WARM=1 LINT_WARM_FILE=<file> LINT_WARM_KIND=config|lint` pre-starts the worker), `run-all.sh <projects…>`, `summarize.mjs results/server.jsonl`, `probe-noprogram.cjs` (thrown error without a program + generic disable by metadata). Results: `results/server.jsonl`, `server-*.log`, `oneshot.txt`, `heft-lint.txt`, `heft-*-{clean,warm}.log`, `heft-plants.log`, `plants-{A,B,heft}.txt`. Plants: `plants/` (also parked in `parked/rea-plants`).
