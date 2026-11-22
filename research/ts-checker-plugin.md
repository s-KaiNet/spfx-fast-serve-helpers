# ts-checker-rspack-plugin with the project's TypeScript as fast-serve's background type check (spike, 2026-11-22)

Research only: nothing in `src/` changed. Prototypes, the patched build, raw results and logs are in `/var/tmp/tsplugin-research/` (`proto/`, `repo/`, `results/`). This follows [type-check-while-serving.md](type-check-while-serving.md) (option A) and the decision in [ts7-vs-ts5-diagnostics.md](ts7-vs-ts5-diagnostics.md): the project's own TypeScript (5.8.3) on the unchanged project tsconfig.

## Verdict

**Use the plugin.** Every weakness can be removed or hidden with a small amount of glue code. That code only uses public APIs: the plugin's hooks (the `start` hook is documented as the place to change the file list or delay a check), `compiler.watching.invalidate()` and `compilation.builtModules`. The spike also found two more problems, both fixable:

| # | Weakness | Result | How |
|---|---|---|---|
| 1 | Issues only go to the plugin's own logger | **solved** | The `issues` hook gets structured issues with the **complete current list** after every check (an empty list means clean). A no-op `logger` silences the plugin completely. With `devServer: false` and `async: true`, issues never reach Rspack stats or the dev-server client |
| 2 | Cold start after every fast-serve restart | **partly** | `typescript.mode: 'write-tsbuildinfo'` (watch mode, **not** `build`) + `configOverwrite` `incremental`/`tsBuildInfoFile`: the check after a restart takes half the time on the big projects (bench 9.3 → 4.6 s, b500 7.5 → 4.2 s, rea 3.6 → 3.4 s), and edits don't get slower. It's still a new process with a new program; the in-memory state can't be kept |
| 3 | Type-only file saves cause no-op Rspack rebuilds | **partly (hidden)** | The plugin has no option to stop adding these dependencies, and it only checks on a compilation, so the rebuild stays. It changes no modules (`compilation.builtModules.size === 0`), so we can skip the `rebuilt in` line. The page still gets a hot update that only contains the runtime's hash (no modules) |
| 4 | Start-up race with the SCSS typings writer | **solved** | Load the heft `SassProcessor` cache so unchanged typings aren't rewritten (0/10 false-error starts, before 3/10), and/or hold the first check until the first compile is done and the typings have settled |
| 5 | **New:** the plugin never sees generated typings change | **solved with glue** | On a fresh clone, 69 `TS2307 Cannot find module './X.module.scss'` errors stayed **forever**. A class added to a `.module.scss` kept its `TS2339` error (still there after 30 s). Fix: pass the typings files we write to the next check through the `start` hook, and `invalidate()` the compiler. Fresh-clone errors clear on their own; a class addition clears in 1.0 s |
| 6 | **New:** the plugin delays every "ready" | **solved with glue** | `afterCompile` waits for the dependencies worker (node + TypeScript start-up) before the first compile can finish: +0.4–0.5 s to `compiled`, +0.3–0.4 s to every `restarted in`. Holding the first check (start hook) until the first `done`, then one `invalidate()`, brings restarts back to the no-checker time (rea 274 ms, bench 589 ms) without slowing the check |

Key numbers (bench, 1006 files, median of 3, 2-core laptop): first result after a cached start **5.1 s** (cold 10.2 s); after a fast-serve restart **4.6 s**; leaf edit → issues delivered **0.30 s**; `escape1` reported **0.32 s**; edit to a widely used type **5.6 s**. Rebuild +75 ms (CPU contention). Checker processes **~1.0 GB** (issues worker 560 MB after the first check, up to ~900 MB, plus the dependencies worker ~100 MB). **Effort S–M** (≈ 2 days including tests).

Compared with our own runner (`tsc -w` with TS 5.8, numbers from the previous spike, not measured inside fast-serve), edits come out the same or slightly faster with the plugin: changes arrive from Rspack's watcher with no `tsc` debounce, leaf 0.25–0.30 s vs 0.42 s. A warm restart is probably 1.5–2 s slower than an own incremental runner would be. That's an estimate: the warm one-shot `tsc` was 2.0/2.5/2.7 s versus the plugin's 3.4/4.2/4.6 s. The extra time is the worker start-up and the CPU it shares with the first compile. An own runner wouldn't have weaknesses 3, 5 and 6, but it needs its own process management, its own output parsing or worker protocol, and its own file watching (Windows!). That's about what the plugin already does.

## Setup

- Machine as in the previous spike: i7-7500U (2 cores/4 threads), 22 GB RAM, Linux, Node 24.21.0. The user's other tools kept running; one run had a load average near 9 and is noted where it matters.
- fast-serve `1.24.0-beta.8` built from a copy of `v1.24` (`/var/tmp/tsplugin-research/repo`). Patched build (for item 4): `SassProcessor.loadCacheAsync(temp/fast-serve/sass-typings)` when the typings folders exist (`repo/src/styles/scssTypings/heftSass.ts`, +3 lines). `ts-checker-rspack-plugin@1.8.0` (latest), `typescript@5.8.3` from each project (`typescriptPath` resolved from the project).
- Projects: copies in `/var/tmp/tsplugin-research/{rea,b500,bench}` (spfx-rea 22 files, bench-500 579, spfx-bench 1006). Same edits and targets as before: leaf string, optional field in a widely used type (rea: `IHelloWorldProps`, used only through `import type` → not in the Rspack graph; b500/bench: `types.ts`, which is in the graph), `escape1` in, `escape1` out.
- The plugin is added through `fast-serve/rspack.extend.mjs` (`proto/rspack.extend.mjs`). Env switches: `TSP_MODE` = `off` | `ro` (default `readonly`) | `wtb` (`write-tsbuildinfo` + incremental overwrite) | `wtbn` (the same + `declaration: false, noEmit: true`) | `build` (`build: true`); `TSP_SCSS_DEPS=2` turns on the typings feed; `TSP_GATE=3` turns on the first-check gate. The file also prints marks (`watchRun`/`done`, plugin `start`/`waiting`/`error`/`issues`), the issue list, and stats per `done` (built modules, hot-update assets, changed chunks, compile errors/warnings).
- Harness `proto/bench.mjs <project> <mode> <runs> <restarts>`: real `fast-serve`; times from the file write. A check counts only once a `check-start` followed the write. Restarts are triggered by a whitespace change in `fast-serve/config.json`. RSS of the server and its child processes is sampled every 200 ms. Stop: SIGINT to the process group (as Ctrl+C), then a search for leftover worker processes. Matrix: for each mode, one priming start (fills the Rspack persistent cache), for `wtb`/`wtbn` one cold start (`.tsbuildinfo` deleted), then the main run: 3 rounds of the 4 edits + 3 restarts. Medians of 3. Results: `results/main.jsonl`, `cold.jsonl`, `build.jsonl`, `race-*.jsonl`, `fresh-*.json`, `scss-*.log`; `python3 proto/show.py < results/main.jsonl` prints them.

## 1. Issues routing — solved

- **Hook semantics (from the 1.8.0 source, confirmed by the runs).** In async watch mode, the plugin's `done` tap waits for the current check and calls `hooks.issues.call(issues, compilation)` with the **full** diagnostic list of the program, after `issue.include/exclude`. Then it calls `logger.error(formatted)` and `logger.log('[type-check] … in N ms')`. An empty array after a fix is the "clean now" signal. `waiting` fires when the check is still running at `done`. `error` fires on worker failures (`RpcExitError`, e.g. out of memory). `canceled` is never fired in 1.8.0, and a superseded check delivers nothing (only the latest result is reported). So we keep the last list and print only when the set changes.
- **Delivery confirmed** for the initial check, every edit, error in/out (`[{severity:'error', code:'TS2552', file, line 11, column 38, message:"Cannot find name 'escape1'. Did you mean 'escape'?"}]`, then `[]`), and type-only file edits (rea `IHelloWorldProps`: 0.23–0.30 s after the save).
- **Silence:** with `logger: { log() {}, error() {} }` no line from the plugin reached our terminal in any run (`unexpectedOutput` was empty in all 40+ runs). The plugin's infrastructure-logger lines are at `log`/`debug` level, below our `infrastructureLogging: 'warn'`. `formatter` only affects what reaches the logger. The only line that can escape is the worker's own `console.warn('[type-check] Skipped because the parent process exited…')`, printed once when fast-serve is SIGKILLed during a check (workers inherit stdio).
- **Never Rspack errors:** with `async: true` the plugin pushes issues into `stats.compilation.errors/warnings` only when it captured the dev server's `done` tap, and it captures it only if `devServer !== false`. All 189 `done` events with the checker had `errors=0 warnings=0`, including the rebuilds with `escape1`, and no `rebuilt in` line got error counts. Our compile report and the compile overlay don't change.
- **Terminal block sketch:** keep `lastKey = JSON.stringify(sorted issues by file/line/column/code)`. On each `issues` call, if the key changed: errors print in the `formatCompileProblems` layout (`type error in src/…/Second.tsx:11:38` + `TS2552 Cannot find name 'escape1'…`), then a summary `type check: 1 error` or `type check: no errors`. The first result always prints once. Repeated identical results stay silent.
- **Overlay sketch (optional, off by default):** the dev-server client drops message types it doesn't know (`onSocketMessage[type]` only), so `server.sendMessage(clients, 'type-errors', …)` can't reach our page runtime. Add a small `text/event-stream` middleware (`/fast-serve/type-check`) through the feature's `middlewares`. The page runtime (`browserErrors/runtime`) opens an `EventSource` only when `typeCheckOverlay` is on and shows a `type` section next to `compile`/`runtime`, hidden when the list is empty. It also works through the tunnel (same origin as the bundles).

## 2. Warm restarts — partly solved

| Mode | What persists | bench: first check after start (cold / warm) | after restart | leaf / wide type / `escape1` |
|---|---|---|---|---|
| `readonly` (default) | nothing | 9.9 s | 9.3 s | 0.25 / 5.6 / 0.23 s |
| `write-tsbuildinfo`, watch mode, overwrite `incremental` + `tsBuildInfoFile` (`wtb`) | `temp/fast-serve/typecheck.tsbuildinfo` (317 KB on rea) | 10.2 / **5.1 s** | **4.6 s** | 0.30 / 5.6 / 0.32 s |
| same + `declaration: false, noEmit: true` (`wtbn`) | the same | 10.1 / 5.1 s | 4.6 s | 0.28 / 6.0 / 0.30 s |
| `build: true` (+ `write-tsbuildinfo`) | **nothing**: the solution-builder host re-reads the tsconfig without `configOverwrite`, and no `.tsbuildinfo` was written anywhere | 11.9 s | 11.3 s | **9.4–10.1 / 10.2–10.6 / 9.2–9.7 s**, workers up to 1.9 GB |

- `write-tsbuildinfo` without `build` is **not documented**: the README says it "requires `build: true`". But the worker code supports it: `emitTsBuildInfoIfNeeded` → `program.emitBuildInfo()` after each program update, and the TS watch program reads the old `.tsbuildinfo` (`readBuilderProgram`) when `incremental` is set. Pin the plugin version and cover it with an integration test.
- With `write-tsbuildinfo`, the plugin's implicit overwrite adds `declaration: true, noEmit: false` (the rig already has `declaration: true`). It also always adds `skipLibCheck: true, sourceMap: false` (the rig has `skipLibCheck: true` too). Only `.tsbuildinfo` reaches the disk; everything else goes to the in-memory file system. `wtbn` gave the same times, so overriding only `incremental` + `tsBuildInfoFile` (`wtb`) stays closest to the project's own options. The plugin deletes the `.tsbuildinfo` itself when `tsconfig.json` changes, and TypeScript ignores a `.tsbuildinfo` from another TS version.
- Build mode re-checks the whole project after every edit and can't persist with an overwrite: it's out. (The README itself warns that build mode slows re-checks.)
- Warm doesn't help much on small projects (rea 3.6 → 3.4 s): parsing `lib`, React and SPFx `.d.ts` files dominates, and `.tsbuildinfo` only skips checking unchanged files.
- **Worker lifecycle:** the plugin forks 2 Node processes per instance (`getIssuesWorker` and `getDependenciesWorker`). On a fast-serve restart the old compiler's `watchClose` terminates them: always 2 workers alive after each of 3 restarts, never more than 2 at any time. Stop: Ctrl+C (SIGINT to the group), SIGINT and SIGTERM to the main process all exited in 26–60 ms with no leftover workers. SIGKILL of fast-serve: idle workers exit within 3 s (IPC disconnect). A busy worker finishes its current check first (7.3 s on bench at start-up), then exits and prints the one `Skipped because the parent process exited` line.

## 3. No-op rebuilds — partly (hidden)

- **Confirmed:** with the checker, saving the type-only `IHelloWorldProps.ts` in rea causes an Rspack rebuild (70–110 ms) with `builtModules = 0`. It is still reported as `rebuilt in N ms (src/…/IHelloWorldProps.ts)`, and the 5 bundles get a hot update. Without the checker there is no rebuild. The same no-op rebuild comes from our own `invalidate()` calls (typings feed, gate), with no changed files.
- **What the page receives:** the full hash changes on every rebuild, even a pure `touch` without the checker. So each bundle gets a `*.hot-update.js` that only sets `__webpack_require__.h` (the `get_full_hash` runtime module), plus `hot-update.json` with `"m": []`. The dev server sends `hash`/`ok`, not `still-ok`. It's harmless (no module code is applied), but our page runtime's `finishUpdate` treats it as an update and closes an open runtime-error overlay.
- **Detection:** `compilation.builtModules.size === 0` after a non-first compile, together with no compile errors/warnings, means "no module changed" and is enough to skip the line. Every real edit, including whitespace-only and `touch`, rebuilds at least one module (`built=1`). A changed scss rebuilds its module, and a deleted file rebuilds its importer. Optionally also require that every file in `compiler.modifiedFiles` is outside the module graph (or is a typings file).
- **Not adding the dependencies isn't an option:** there is no option for it. Removing them in a later `afterCompile` tap would mean type-only edits are never re-checked, unless we watch those files ourselves and `invalidate()`, which is the same no-op rebuild again. The plugin only checks per compilation; it has no public "check now" API.

## 4. Start-up race and generated typings — solved

| Scenario (`readonly`) | Result |
|---|---|
| beta.8 unchanged, 5 cached starts each on bench and b500 | **3/10 starts with false errors**: bench 1 start × 5 `TS2306 '…/NodeN.module.scss.d.ts' is not a module`; b500 2 starts (2 and 1 issues). They stay until a later check happens to re-read the file |
| patched (`SassProcessor.loadCacheAsync`), after one priming start, 5 cached starts each | **0/10**; the mtimes of all `temp/sass-ts/**/*.d.ts` were unchanged after the 10 starts (hash of the mtime listing before/after) |
| fresh clone (`temp/sass-ts` and the cache moved away), b500, stock plugin | 69 × `TS2307 Cannot find module './NodeN.module.scss'` in the first result. **Still all 69** after 20 s and after 4 later edits. Also with the typings added to Rspack's `fileDependencies`/`missingDependencies` |
| fresh clone, typings feed on | the first check (started at +3.3 s) was superseded by the feed's rebuild at +11 s (69 typings changed). The first result at +34.8 s was `[]`; the 69 false errors were never shown |
| `styles.newClass` used in `Node350.tsx`, then `.newClass` added to the scss, stock plugin | `TS2339` reported after 0.57 s, **still reported 30 s after the scss save** |
| the same with the typings feed | cleared **1.0 s** after the scss save: check 1 (stale, same issue, silent because the set didn't change) → typings written → no-op rebuild (109 ms, no files) → check 2 `[]` |

Why: the plugin's TypeScript system doesn't watch the disk. It learns about changes only from Rspack's watcher events (`changedFiles` passed into the worker). `temp/sass-ts` and `temp/static-asset-ts` files are read through `rootDirs`, but they are neither in the Rspack graph nor in the tsconfig `include`, so their changes never arrive. The earlier spike also saw this ("they disappear only after the next change"). For a missing typing it's worse: the failed lookup is never invalidated.

Fix (prototype `feedTypings` in `proto/rspack.extend.mjs`): collect the typings files we write. On each one, add it to `pending` and call `compiler.watching.invalidate()` after a 100 ms debounce. A `start` hook tap appends `pending` to `change.changedFiles`. In the product, the SCSS typings (heft `SassProcessor`) and the asset typings tell the type-check feature which files they wrote, so we don't need an extra watcher. With the cache from the first row, a cached start writes nothing and triggers nothing.

## 5. Numbers

Medians of 3, ms after the save unless marked. "first check" = from process start (cached Rspack start). "restart" = from the `fast-serve/config.json` save to the first type-check result of the new session. `wtb` = recommended mode; `gate` = `wtb` + first-check gate (one run of 3 rounds/3 restarts). `build` rows: mean of 2 rounds/2 restarts.

| Project | Mode | first compile (from start) | first check cold / warm | restart → `restarted in` | restart → check | leaf | wide type | `escape1` in → issues | out → `[]` | rebuild, all edits (range) | peak RSS server / checker |
|---|---|---|---|---|---|---|---|---|---|---|---|
| rea | off | 614 | – | 270 | – | – | – (no rebuild) | – | – | 98 (54–118) | 271 / – |
| rea | readonly | 1112 | 4138 | 571 | 3593 | 170 | 249 | 159 | 184 | 83 (46–130) | 361 / 673 |
| rea | wtb | 1111 | 4377 / 3944 | 600 | 3354 | 229 | 299 | 205 | 193 | 98 (64–119) | 361 / 690 |
| rea | wtb + gate | – | – | **274** | 3361 | 257 | 324 | 209 | 213 | 97 (57–134) | 436 / 685 |
| rea | build | 1123 | 4161 | 617 | 3571 | 2125 | 1946 | 1953 | 1943 | – | 355 / 1289 |
| b500 | off | 868 | – | 550 | – | – | – | – | – | 115 (66–143) | 898 / – |
| b500 | readonly | 1246 | 7780 | 845 | 7537 | 235 | 3440 | 216 | 217 | 143 (82–193) | 957 / 853 |
| b500 | wtb | 1292 | 7905 / 4685 | 852 | 4169 | 260 | 3381 | 262 | 296 | 145 (107–249) | 928 / 886 |
| bench | off | 927 | – | 606 | – | – | – | – | – | 101 (78–143) | 990 / – |
| bench | readonly | 1384 | 9904 | 986 | 9328 | 254 | 5595 | 225 | 240 | 166 (111–278) | 1229 / 1064 |
| bench | wtb | 1418 | 10226 / 5051 | 1019 | 4613 | 299 | 5627 | 321 | 306 | 176 (99–223) | 1032 / 990 |
| bench | wtb + gate | – | – | **589** | 4674 | 274 | 5884 | 288 | 285 | 154 (117–181) | 1244 / 999 |
| bench | build | 1513 | 11925 | 1080 | 11333 | 9749 | 10396 | 9454 | 9377 | – | 871 / 1927 |

- `wtbn` (same as `wtb` but `noEmit`): b500 4718 warm / 4138 restart, bench 5078 / 4581; edits like `wtb`. One earlier rea `wtbn` run gave 6.0 s restarts while the laptop was loaded. A repeat gave 3.3 s.
- The gate rows' first start was an uncached Rspack compile (the extend file changed), so first-start numbers are left out.
- Rebuild = save → Rspack `done` (when the hot update is ready). The checker never blocks it (async); the extra time is CPU contention: bench +75 ms, b500 +30 ms, rea none.
- Memory: the checker tree is the two workers; bench after the first check: issues worker 560 MB, dependencies worker 104 MB; peak ~1.0 GB after edits to the widely used type.
- Previous spike, TS 5.8 `tsc -w` standalone (the "own runner" basis), same projects: initial 3.5 / 8.1 / 10.5 s (cold), leaf 0.41 / 0.44 / 0.42 s, wide type 0.47 / 3.7 / 6.1 s, peak 575 / 858 / 1047 MB. Warm one-shot `tsc --incremental`: 2.0 / 2.5 / 2.7 s. The plugin's per-edit results are as fast or faster; its memory is about the same; its warm restart (3.4 / 4.2 / 4.6 s) is slower than an incremental own runner would probably be (not measured).
- Seen once under load (load average ~9): the plugin read `Second.tsx` while the harness was rewriting it and reported `TS2306 'Second.tsx' is not a module`. The error stayed for one more check (until the next save of that file). Editors that write in place could hit the same window.

## 6. Integration details

- **Windows** (docs/code only, not tested): paths are normalised for win32 throughout the plugin. Workers are `child_process.fork` without a shell. The only open Windows issue (#32) is `EBUSY lstat 'C:\DumpStack.log.tmp'` from chokidar when a watched wildcard directory is a drive root; SPFx `include` is `src/**`, so the plugin's directory watcher only covers `src`. On Windows, Ctrl+C reaches every console process, and our graceful close terminates the workers anyway.
- **Linked library roots:** the consumer's tsconfig checks only its own `src`; library imports resolve to the library's built `.d.ts`. Checking library source would need one plugin instance per root (`configFile` = library `tsconfig.json`), each with 2 more processes (~0.7–1 GB). Hooks are shared per compiler (`compilerHookMap`), so issue lists from several instances arrive on the same `issues` hook and an empty list can't be attributed to a root. A per-instance `logger` (its `log` call follows that instance's `issues` call synchronously) would work around that. Recommendation: consumer only in v1; library roots later, behind an option.
- **Extend file:** after merging the extend config, if any plugin's `constructor.name` is `TsCheckerRspackPlugin` (or `ForkTsCheckerWebpackPlugin`), skip ours and print `type check: using the TsCheckerRspackPlugin from fast-serve/rspack.extend.mjs` (their output, their options). Users can also turn ours off with `typeCheck: false`.
- **Install weight and dependency type:** 17 MB, 32 packages (14 MB is `memfs`'s `@jsonjoy.com/*`; `chokidar` 4, `picocolors`, `@rspack/lite-tapable`). For comparison: `@rspack/*` 55 MB, fast-serve 8.8 MB. Peers: `typescript >=3.8` (required), `@rspack/core ^1 || ^2` (optional). Since the check is on by default: a regular **dependency**, pinned to `~1.8.0`, loaded lazily (`createRequire`) only when `typeCheck` is on. Also declare `typescript` as an optional peer of fast-serve, so pnpm links the project's TypeScript instead of auto-installing another one for the plugin's peer. We always pass `typescriptPath` resolved from the project root anyway.
- **Maintenance:** `rstackjs/ts-checker-rspack-plugin` (the Rspack team's org), 1.8.0 on 2026-11-11, 9 releases since July (1.5.1 → 1.8.0), 4 open issues, Rspack 2 supported, used by `@rsbuild/plugin-type-check`. Recent work is mostly on tsgo mode; the TS 5 worker code is the mature fork-ts-checker code.

## 7. Recommended configuration

```js
new TsCheckerRspackPlugin({
  async: true,
  devServer: false,
  formatter: 'basic',
  logger: { log() {}, error() {} },
  typescript: {
    configFile: path.join(root, 'tsconfig.json'),
    context: root,
    typescriptPath: createRequire(path.join(root, 'package.json')).resolve('typescript'),
    build: false,
    mode: 'write-tsbuildinfo',
    configOverwrite: { compilerOptions: { incremental: true, tsBuildInfoFile: path.join(root, 'temp', 'fast-serve', 'typecheck.tsbuildinfo') } },
    diagnosticOptions: { syntactic: true, semantic: true },
  },
});
```

`diagnosticOptions.syntactic: true` (default `false`) wasn't measured. It makes syntax errors in files outside the Rspack graph visible (type-only files), as heft reports them, and should cost little. `memoryLimit` keeps the plugin default (8192 MB heap limit, the same as Rsbuild).

## 8. Design sketch

- **Options:** `"typeCheck": true | false` (default **true**, terminal only), `"typeCheckOverlay": false` (default off); CLI `--no-type-check`, `--type-check-overlay`. Skipped automatically when the project has no `tsconfig.json`/`typescript`, or the extend file brings its own instance.
- **`src/typeCheck/`** (feature folder):
  - `index.ts`: `Feature` contributing the plugin (options above) plus a glue plugin;
  - `gate.ts`: a `start` tap that waits for the first `done` and for typings settled (`scssTypings.settled()` + asset typings), plus one `compiler.watching.invalidate()` after the first compile, so the plugin's dependencies are registered and the first result is delivered. This removes weakness 6 and the race (4) without relying on the cache alone;
  - `typingsFeed.ts`: `onTypingsWritten(files)` → pending set → `start` tap appends to `changedFiles`; debounced `invalidate()` (weakness 5);
  - `report.ts`: last issue set → terminal block only on change (format above);
  - overlay: SSE middleware + page runtime section (only with `typeCheckOverlay`).
- **Elsewhere:** `styles/scssTypings/heftSass.ts`: `loadCacheAsync(temp/fast-serve/sass-typings)` when the typings folders exist, and report the written typings files (watch the typings folders, or compare mtimes around `compileFilesAsync`). `assets/assetTypings.ts` already writes only outdated files; report them. A small channel in `featureApi` (e.g. `context.page`-like `typings.onWritten`) connects them without feature-to-feature imports. `server/devServer.ts` `reportCompiles`: skip the `rebuilt` line when `builtModules.size === 0` with no errors/warnings (weakness 3). `extend`: detect a user instance. Errors from the `error` hook print once (`type check stopped: …`); during shutdown they're ignored.

## 9. Effort

**S–M, ≈ 2 days:** about 5 small modules (~300–400 lines). Unit tests: report diffing/format, gate ordering, feed, no-op detection on a stats stub. One integration test: a real compile with the plugin on a fixture with a planted error, the fix, a type-only file, and a typings change (slow, ~5–10 s, TypeScript start-up). Plus README/KB.

## 10. Risks

- Depends on plugin behaviour beyond the documented options: `write-tsbuildinfo` in watch mode (README says build only), issues delivered only on `done`, hooks shared per compiler. Mitigation: pin `~1.8.0`, integration test.
- Memory: ~0.7–1 GB per project for the TS 5.8 workers (2 processes). CPU contention adds up to ~75 ms per rebuild on a 2-core laptop.
- Restarts are only half-warm: 3.4–4.6 s to the first result. Edits to a widely used type take 3–6 s (TypeScript 5.8 itself).
- Empty runtime-only hot updates after type-only saves; they close an open runtime overlay.
- Transient reads of half-written files (seen once under heavy load).
- SIGKILL during a check leaves the worker running until that check ends and prints one stray line.
- Windows and macOS not run; library roots not prototyped.

## Reproduce

`/var/tmp/tsplugin-research/`: `proto/rspack.extend.mjs` (copy into `<project>/fast-serve/`), `proto/bench.mjs <project> off|ro|wtb|wtbn|build <runs> <restarts> [port]` (env `TSP_FRESH=1` deletes `.tsbuildinfo`, `TSP_SCSS_DEPS=2` feed, `TSP_GATE=3` gate, `TSP_STOP=SIGINT-group|SIGINT|SIGTERM|SIGKILL`), `proto/matrix.sh`, `proto/starts.sh` (race), `proto/fresh.sh` (fresh clone), `proto/scss.mjs <project> 0|2` (class added), `proto/killmid.sh KILL|TERM` (worker exit during a check), `proto/show.py` (summary). Patched build: `repo/` → `pkgs-patched/`; unpatched: `pkgs-base/`.
