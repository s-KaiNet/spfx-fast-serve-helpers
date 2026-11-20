# Type checking while serving: tsgo vs ts-checker-rspack-plugin (spike, 2026-11-21)

Research only, nothing in `src/` changed. Prototypes, raw results and logs are in `/var/tmp/tscheck-research/` (`proto/`, `results/`).

## TL;DR

- **The SPFx 1.24 rig tsconfig doesn't work with TypeScript 7.** `tsc` 7 stops with `TS5108 target=ES5 removed`, `TS5108 moduleResolution=node10 removed` and `TS5023 unknown option importsNotUsedAsValues` (that last one is set in the rig, so an `extends` override can't remove it), and also `TS5102 baseUrl removed` when the project sets it. Any tsgo option (B or C) needs a **tsconfig that fast-serve generates**: the extends chain flattened, with those options rewritten. With that file, tsgo reports the same diagnostics as TS 5.8/heft on our planted errors, except the two checks that only exist with `target: es5` (TS2802).
- **Speed:** tsgo one-shot checks are 5–8× faster than TS 5.8 (bench: 0.98 s vs 7.99 s cold, 0.56 s vs 2.65 s warm). But the **TS 7.0.2 `--watch` is slow per edit** (1.1 s on the 22-file project, 2.0 s on the 1000-module one, whatever the edit), so for leaf edits it is slower than the TS 5 watch program in ts-checker-rspack-plugin (0.25 s). **TS 7.1.0-beta fixes this:** 0.24 s for a leaf edit and 0.8 s for an edit to a widely used type on bench (TS 5: 0.42 s and 6.1 s).
- **ts-checker-rspack-plugin (1.8.0) can run tsgo itself (option C):** it switches to tsgo automatically when the `typescript` it resolves is ≥ 7. In that mode it starts a new one-shot `tsc --project … --noEmit --pretty` for every Rspack compilation and parses the text output. That takes 0.6–0.8 s per edit on bench, has no watch state, and doesn't support `configOverwrite`, so it still needs our generated tsconfig.
- **Every checker slows the Rspack rebuild a little on this 2-core/4-thread laptop** (bench, rebuild for a leaf edit ≈ 85 ms without a checker): A ≈ 140–240 ms, B/C with multi-threaded tsgo ≈ 180–240 ms, B with `--singleThreaded` ≈ 115–150 ms. Hot updates are never blocked (all checks are async). The time added is CPU contention only.
- **Recommendation: B.** fast-serve runs `tsc` 7.1+ itself as `--watch --singleThreaded` in a child process, on the generated tsconfig, starts it after the first compile and once SCSS/asset typings are settled, and parses its output into our own terminal report (overlay optional, off by default). Ship `typescript@^7.1` as a dependency of the package. Effort **M**. Until 7.1 is stable (npm `latest` is still 7.0.2; 7.1 is `beta`), either pin the beta or run a one-shot incremental check after each Rspack `done` (C-style, but sequenced after the rebuild so it can't compete with it). Keep A (TS 5 in the plugin) only as a parity fallback; it's not worth it as the default: 4–10 s to the first result, 3–6 s for edits to a widely used type, ~0.6–1 GB per process tree.

## Setup

- Machine: Intel i7-7500U (2 cores, 4 threads), 22 GB RAM, Linux, Node 24.21.0. The user's editor tsserver was running in the background, the same for every run.
- fast-serve `1.24.0-beta.7` (the tgz built from `v1.24`), installed in copies of the test projects in `/var/tmp/tscheck-research/{rea,bench,b500}`, plus `ts-checker-rspack-plugin@1.8.0`.
- TypeScript: the projects' own `typescript` 5.8.3 (the SPFx 1.24.1 template pins `~5.8.0`; heft uses it); `typescript@7.0.2` (npm `latest`, native `tsc`); `typescript@7.1.0-beta`.
- Projects (`.ts/.tsx` files in `src`): spfx-rea 22, bench-500 (`/var/tmp/rspack-impl/bench-500`) 579, spfx-bench 1006 (Fluent UI, PnPjs). All three are clean with TS 5.8 and with tsgo on the generated tsconfig.
- Edits: (a) leaf component (string literal in a leaf `.tsx`), (b) widely used type (an optional field added to `INodeProps`, imported by ~1000 files in bench; in rea, `IHelloWorldProps`, 2 importers), (c) error in: `escape1` (undefined name, the user's case) in the leaf, (d) error fixed again.
- Harnesses (in `proto/`): `oneshot.sh` (CLI, `/usr/bin/time`), `watchbench.mjs` (a checker in watch mode on its own: time from the file write to `Found N errors. Watching…`), `serverbench.mjs` + `rspack.extend.mjs` (real `fast-serve` with the checker added through the extend file; `[mark]` lines from Rspack `watchRun`/`done` and from the checker's `issues` hook give save→rebuild-done and save→issues-reported; RSS of the server and its child processes sampled every 200 ms), `flatten.mjs` (the generated tsconfig).
- Numbers are medians of 3 (the raw values are in `results/*.jsonl` / `oneshot.txt`). The "rebuild" time is save → Rspack `done` on the server, which is when the hot update is ready to be sent. Browser apply time isn't included (no browser was used).

## 1. Speed

### One-shot CLI check (`--noEmit`, seconds / peak RSS MB, median of 3)

| Project | TS 5.8 cold | TS 5.8 warm (`.tsbuildinfo`) | tsgo 7.0.2 cold | tsgo 7.0.2 warm | tsgo 7.1-beta cold (1 run) | tsgo 7.1-beta warm |
|---|---|---|---|---|---|---|
| rea (22) | 2.48 / 418 | 1.97 / 405 | 0.37 / 204 | 0.34 / 186 | 0.35 | 0.30 |
| b500 (579) | 5.78 / 510 | 2.52 / 431 | 0.80 / 272 | 0.48 / 236 | 0.69 | 0.41 |
| bench (1006) | 7.99 / 555 | 2.65 / 478 | 0.98 / 325 | 0.56 / 271 | 0.94 | 0.47 |

TS 5.8 without `incremental` on the original `tsconfig.json`: rea 2.33 s, b500 5.70 s, bench 7.86 s.

### Watch mode on its own (ms from the write to the result, median of 3)

| Project | Checker | Initial | Leaf edit | Widely used type | Error in | Error fixed | Peak RSS |
|---|---|---|---|---|---|---|---|
| rea | TS 5.8 `tsc -w` | 3487 | 412 | 471 | 399 | 380 | 575 MB |
| rea | tsgo 7.0.2 `-w` | 1464 | 1113 | 1132 | 1172 | 1155 | 327 MB |
| rea | tsgo 7.1-beta `-w` | 423 | 133 | 168 | 111 | 144 | 263 MB |
| b500 | TS 5.8 | 8141 | 436 | 3673 | 399 | 450 | 858 MB |
| b500 | tsgo 7.0.2 | 2573 | 1793 | 2183 | 1759 | 1741 | 473 MB |
| b500 | tsgo 7.1-beta | 720 | 197 | 541 | 223 | 218 | 369 MB |
| bench | TS 5.8 | 10512 | 420 | 6120 | 424 | 429 | 1047 MB |
| bench | tsgo 7.0.2 | 2455 | 2005 | 2699 | 2013 | 1979 | 543 MB |
| bench | tsgo 7.1-beta | 1035 | 236 | 805 | 173 | 214 | 407 MB |

tsgo 7.0.2 notices the change after ~50 ms (inotify) but then spends more time per cycle than a warm one-shot run (bench 2.0 s vs 0.56 s), even on the 22-file project. 7.1-beta doesn't have that overhead.

### Inside fast-serve (ms after the save, median of 3; bundles, cache and server as in normal use)

First result after `fast-serve` starts (two cached starts each; time from process start; without a checker the server is ready after rea ≈ 0.6–0.7 s, b500 ≈ 0.83 s, bench ≈ 0.93 s):

| Project | A (TS 5.8 plugin) | B (tsgo 7.0.2 `-w`, started after first compile) | C (plugin, tsgo 7.0.2) |
|---|---|---|---|
| rea | 4089 / 4185 | 2172 / 2146 | 1076 / 1107 |
| b500 | 8194 / 8200 | 3376 / 3252 | 1502 / 1443 |
| bench | 10361 / 10232 | 3785 / 3843 | 1659 / 1725 |

B with 7.1-beta and `--singleThreaded` on bench: 1968 ms (one run, cached start). C is fast at start because it runs a warm one-shot check in parallel with the first compile. A has no incremental cache in watch mode (`readonly` by default; `.tsbuildinfo` needs `build: true`, which the plugin README itself says makes re-checks slower).

Save → type-check result, with the Rspack rebuild time for the same save:

| Project | Mode | Leaf check | Widely used type check | Error in → reported | Error fixed → reported | Rebuild for a leaf edit (median of the 4 edit kinds) | Peak RSS server / child processes¹ |
|---|---|---|---|---|---|---|---|
| rea | off | – | – | – | – | 64 (57–64) | 243 / 0 |
| rea | A | 242 | 237 | 173 | 188 | 135 (67–135) | 366 / 692 |
| rea | B 7.0.2 | 1256 | 1131 | 1209 | 1167 | 180 (103–180) | 329 / 340 |
| rea | C 7.0.2 | 481 | 524 | 477 | 456 | 122 (110–129) | 313 / 205 |
| b500 | off | – | – | – | – | 111 (70–111) | 592 / 109 |
| b500 | A | 222 | 3320 | 222 | 241 | 119 (119–138) | 624 / 958 |
| b500 | B 7.0.2 | 1779 | 2248 | 1884 | 1801 | 198 (166–198) | 580 / 494 |
| b500 | B 7.1-beta | 259 | 597 | 228 | 249 | 158 (153–201) | 577 / 399 |
| b500 | C 7.0.2 | 679 | 1078 | 656 | 662 | 197 (164–199) | 536 / 324 |
| b500 | C 7.1-beta | 621 | 937 | 636 | 612 | 202 (183–202) | 590 / 270 |
| bench | off (2 sessions) | – | – | – | – | 85 / 92 (78–92) | 642–679 / 125–129 |
| bench | A | 281 | 5712 | 258 | 246 | 237 (137–237) | 688 / 1102 |
| bench | B 7.0.2 | 2077 | 2718 | 2060 | 2031 | 223 (163–223) | 667 / 596 |
| bench | B 7.1-beta | 269 | 912 | 264 | 299 | 200 (180–239) | 639 / 450 |
| bench | B 7.1-beta `--checkers 1` | 278 | 1261 | 277 | 286 | 199 (159–214) | 648 / 421 |
| bench | B 7.1-beta `--singleThreaded` | 275 | 1176 | 306 | 343 | 132 (117–152) | 596 / 365 |
| bench | C 7.0.2 | 772 | 1420 | 742 | 772 | 197 (197–213) | 655 / 412 |
| bench | C 7.1-beta | 711 | 1379 | 710 | 704 | 220 (208–232) | 646 / 349 |

¹ Child processes include `sass-embedded`'s Dart process (~65–130 MB, see "off"). A has two worker processes (issues + dependencies); C's tsgo processes only live for one check each.

- "Error in → reported" is the time from saving `escape1` until the error is ready to print. The terminal line follows within a few ms.
- In rea the "widely used type" file is only imported with `import type`, so it isn't in the Rspack graph: without a checker, saving it doesn't trigger a rebuild. A and C add the tsconfig inputs to Rspack's watched files, so with them the same save causes a (no-op) Rspack rebuild. B watches files itself.
- **Does checking delay the hot update?** Never by waiting (all modes are async). CPU contention adds time: bench +50–150 ms (A), +100–140 ms (tsgo, multi-threaded), +30–60 ms (tsgo `--singleThreaded`), on a 4-thread CPU. `--checkers 1` alone doesn't help, because tsgo still parses in parallel.

## 2. Correctness

Planted errors in a rea copy (`rea-c/src/plants/Plants.tsx`), plus a `baseUrl: "."` + `paths: { "@src/*": ["src/*"] }` added to the project tsconfig (on top of the rig `extends`):

| Plant | TS 5.8 (`tsc`, same as heft) | A (plugin, TS 5.8) | tsgo on the generated tsconfig (B, C) |
|---|---|---|---|
| undefined name `escape1` | TS2552 | TS2552 | TS2552 (same text and position) |
| wrong prop type `<Second description={42} />` | TS2322 | TS2322 | TS2322 |
| missing import `./doesNotExist` | TS2307 | TS2307 | TS2307 |
| type-only import used as a value (`Version.parse`) | TS1361 | TS1361 | TS1361 |
| legacy decorator (`experimentalDecorators` from the rig) | no error | no error | no error |
| `.module.scss` class that doesn't exist (typings from `temp/sass-ts` through `rootDirs`) | TS2339 | TS2339 | TS2339 |
| `.module.scss` without a file | TS2307 | TS2307 | TS2307 |
| `.png` import (`temp/static-asset-ts`) | no error | no error | no error |
| localized string that doesn't exist (`HelloWorldWebPartStrings`) | TS2339 | TS2339 | TS2339 |
| `paths` alias `@src/plants/shared` | no error | no error | no error |
| bare import through `baseUrl` (`src/plants/shared`) | no error | no error | TS2307 without a fix; no error once the generator turns `baseUrl` into `paths: { "*": ["<baseUrl>/*"] }` |
| side-effect import of a missing `./x.css` | no error | no error | TS2882 (TS 7's `noUncheckedSideEffectImports` default); no error with `noUncheckedSideEffectImports: false` in the generated file |
| `for…of` / spread over a `Set` | TS2802 ×2 (only exists with `target: es5`) | TS2802 ×2 | **not reported** (tsgo has no `es5`) |

Final count: TS 5.8 / A 9 errors; tsgo 7 errors, identical except the two TS2802. Both plugin modes print the same issues through their formatter (`ERROR in ./src/…:line:col` + `TSxxxx: message`).

**TS 7 vs the SPFx 1.24 rig** (`@microsoft/spfx-web-build-rig/profiles/default/tsconfig-base.json`: `target es5`, `moduleResolution node`, `module esnext`, `importsNotUsedAsValues remove`, `experimentalDecorators`, explicit `lib`/`types`/`typeRoots`/`rootDirs`): on the project's own tsconfig, tsgo fails with the errors listed in the TL;DR. Still running the check despite them isn't usable, because the exit code and output are always errors. The TS 7 release notes list `target: es5`, `moduleResolution: node/node10`, `baseUrl` and `downlevelIteration` as hard errors now, and `noUncheckedSideEffectImports` / `types: []` / `strict` as new defaults. The rig sets `types` and `strict` explicitly, so only the side-effect default matters. The generated tsconfig that worked on all three projects (`proto/flatten.mjs`):

- the extends chain merged, path options (`typeRoots`, `rootDirs`, `rootDir`, `paths`, `include`) made absolute;
- `target: es5|es3` → `es2015` (the rig's `lib` is explicit, so the global types don't change); `moduleResolution: node|node10|classic` → `bundler` (Fluent UI and PnPjs resolve cleanly in bench); `importsNotUsedAsValues`, `preserveValueImports`, `downlevelIteration`, `baseUrl` dropped (`baseUrl` turned into a `"*"` `paths` entry); `noUncheckedSideEffectImports: false` unless the project sets it;
- `noEmit: true`, emit options dropped, `incremental: true` with `tsBuildInfoFile` in `temp/`.

Neither TS 5.8 nor A has these problems: they read the project's tsconfig as is.

**Generated typings at start.** fast-serve regenerates every SCSS typing (`temp/sass-ts`) at each start, even when nothing changed (all mtimes change). A starts checking when the first compilation starts, so it read typings that were being rewritten and reported false errors at start in 3 of 4 cached bench/b500 starts: `TS2306: File '…/Node35.module.scss.d.ts' is not a module.` (1–2 issues; they disappear only after the next change). With `temp/sass-ts` missing, tsgo `--watch` reports `TS2307 Cannot find module './X.module.scss'` and then clears the errors by itself ~1.2 s after the typings appear (checked by moving the folder back). B started after the first `done` showed no false errors in any run, and neither did C. A design must start the checker only after `scssTypings.settled()` (and the asset typings). Separately, writing typings only when their content changes would avoid both the race and a wasted check cycle at every start.

## 3. Integration comparison

| | A: ts-checker-rspack-plugin + TS 5.8 | B: fast-serve runs tsgo `--watch` | C: ts-checker-rspack-plugin, tsgo mode |
|---|---|---|---|
| Async / blocking | `async` (dev default `true`): issues after `done`; `false` adds them to the compilation | fully separate process, never touches the compilation | same as A; one tsgo run per compilation, the previous run aborted (`SIGKILL`) |
| Issues as Rspack errors (→ our compile report/overlay) | only with `async: false` (blocks the rebuild); async issues go to `logger` and, with `devServer: true`, to the webpack-dev-server overlay (which we don't use) | we route them: own terminal block + our page channel → our overlay | as A |
| Filtering | `issue.include/exclude` (file glob, code, predicate), `defaultSeverity`, waterfall `issues` hook | ours (codes/files in our parser) | include/exclude only on parsed diagnostics; `configOverwrite`, `diagnosticOptions`, `profile` unsupported |
| Hooks / formatting | `start`, `waiting`, `canceled`, `error`, `issues` hooks; `basic`/`codeframe`/custom formatter; `logger` | ours | same hooks; tsgo's text is parsed with a regex; if parsing fails the raw output is printed |
| Uses the project's tsconfig as is | yes | no: generated tsconfig (rig incompatible) | no: needs the generated file (no `configOverwrite`) |
| Incremental across restarts | no (watch mode is `readonly`); `build: true` + `write-tsbuildinfo` for `.tsbuildinfo` | yes (`incremental` in the generated file) | yes (one-shot runs reuse `.tsbuildinfo`) |
| Build mode / project references | `build: true`, modes `readonly`/`write-tsbuildinfo`/`write-references`/`write-dts` | `tsc -b -w` possible; SPFx projects don't use references | `--build`; `write-dts` unsupported |
| Memory limit | `memoryLimit` (default 8192 MB, Node heap of the worker) | none built in (Go runtime; `GOMEMLIMIT` env possible) | none |
| Restart with our dev session (config changes restart the session) | the plugin is part of the compiler: `watchClose` terminates the workers; a new session starts cold (4–10 s) | we kill the child on stop and start a new one; warm through `.tsbuildinfo` (2–4 s with 7.0.2, ≈1–2 s with 7.1) | `watchClose` aborts the run; next start is a warm one-shot run (~1.1–1.7 s) |
| Watch reliability | TS 5 watch program fed by Rspack's file changes + a chokidar watcher for files outside the graph | tsgo's own watcher (Parcel-based, inotify/FSEvents/Windows). 7.0 had macOS FSEvents start problems on huge `node_modules` and a slow `-b -w` start on big solutions (fixed for 7.1) | triggered by Rspack compilations; type-only files outside the graph are added as Rspack dependencies (extra no-op rebuilds) |
| Windows | supported (path handling for win32 in the code) | win32-x64/arm64 binaries shipped; spawning the binary directly needs no shell; not tested here | same binaries, resolved through `typescript/lib/getExePath.js` |
| Install size | 17 MB, 12 top-level packages (mostly `memfs`'s `@jsonjoy.com/*`); peer `@rspack/core` ^1 \|\| ^2 (optional) | `typescript@7`: 3.7 MB + one platform binary package 27 MB (optional dependencies, so `--no-optional` installs break it) | plugin + `typescript@7` |
| Maintenance | `rstackjs`/rspack-contrib; 1.8.0 on 2026-11-11; 14 releases in 2026; Rspack 2 supported; used by `@rsbuild/plugin-type-check` 1.6.1 | Microsoft. 7.0.2 is `latest`; 7.1.0-beta out (the 7.0 post expects the new API with 7.1); 7.0 has no programmatic API, only `unstable/*` exports | tsgo mode says "may change when TypeScript provides a stable JavaScript API" |
| Output format | TS API diagnostics (structured) | `--pretty false` text: `file(line,col): error TSnnnn: message` (+ indented continuation lines), `Found N errors. Watching for file changes.` (the classic tsc format, unchanged in 7) | `--pretty` text parsed by regex |

Reference: `@rsbuild/plugin-type-check` wraps the same plugin with `mode: 'readonly'`, `build` only for project references, `memoryLimit: 8192`, `node_modules` issues excluded, and a logger that only prints errors (renamed "Type Error"). It gets TS 7 support only through the plugin's tsgo mode.

## 4. Recommendation

**B, fast-serve's own tsgo checker, on TypeScript 7.1+.** Reasons: the fastest first result and per-edit result once on 7.1 (leaf ≈ 0.25 s, edit to a widely used type 0.6–1.2 s, versus 3–6 s for TS 5); 2–3× less memory than A; independent of Rspack (no extra rebuilds, no compilation hooks, survives our restarts warm); one process for the whole session. We control the terminal format and the overlay. The cost is the generated tsconfig and the TS 7 binary. Parity: tsgo misses only the `target: es5`-only diagnostics, and heft (TS 5.8) still type-checks every real build.

Not A as the default: it's exact, but slow where it matters (bench: 10 s to the first result after every start/restart, 5.7 s after editing a shared type), heavy (~1 GB tree), it rebuilds Rspack on type-only edits, and it races our typings writer at start. Not C: it gets tsgo's speed only per run (0.6–1.4 s, a full process per rebuild), still needs the generated tsconfig, is the least flexible (no `configOverwrite`), and its integration is officially provisional.

Before 7.1 is stable: 7.0.2's watch (1–2 s per edit) is worse than A for leaf edits. Either depend on `typescript@7.1.0-beta`/`^7.1.0` as soon as it is stable, or have the same feature run `tsc --noEmit` (incremental, one-shot) **after** each Rspack `done` while 7.0 is the newest stable (bench ≈ 0.5–0.6 s + rebuild time; it can't slow the rebuild because it starts after it; we'd need to trigger on type-only files ourselves, through our session file watcher).

### Design sketch

- **Options** (`fast-serve/config.json`, flags win as usual): `"typeCheck": true | false` (default **true**, terminal only), `"typeCheckOverlay": false` (default off), CLI `--no-type-check`, `--type-check-overlay`. Maybe later `"typeCheck": { "tsconfig": "…" }` for projects that check a different tsconfig.
- **Feature folder `src/typeCheck/`:**
  - `checkerTsconfig.ts`: generated tsconfig from the project model (`tsconfigCompilerOptions` + extends chain) → `temp/fast-serve/tsconfig.typecheck.json` and `temp/fast-serve/typecheck.tsbuildinfo` (rules from §2, unit-tested on the rig and on `baseUrl`/`paths` cases);
  - `checkerProcess.ts`: resolve the binary from our `typescript@7` dependency (`typescript/lib/getExePath.js`), spawn `-p <generated> --watch --preserveWatchOutput --pretty false --singleThreaded` (no shell), start after the first compile and after `scssTypings.settled()`/asset typings, kill on session stop/restart (and on `process` exit), report a crash once without restarting in a loop;
  - `parseOutput.ts`: the regex for `file(line,col): error TSnnnn: msg` + continuation lines, cycle end `Found N errors. Watching…`, global `error TSnnnn:` lines, unknown lines passed through;
  - `report.ts`: print only when the result changes, after the compile report. `type check: 2 errors` + `error in src/…/Second.tsx:11:38` / `TS2552 Cannot find name 'escape1'…` (same layout as `formatCompileProblems`); `type check: no errors` when it turns clean; nothing for repeated clean results. Never added to Rspack errors, so the `rebuilt in … ms` lines and HMR stay as they are;
  - overlay: a `type-errors` message on the existing page channel; the browser overlay shows it as its own section only with `typeCheckOverlay`.
- Separate small fix: write SCSS typings only when their content changes (avoids the start-up race and a wasted check cycle).
- **Effort: M.** About 4 modules, unit tests for tsconfig generation and the parser, one integration test running the real binary on a fixture with a planted error, README/KB updates. A (the plugin with our logger + hooks) would be S–M, but needs the typings-settled gate too, so it isn't really cheaper.

### Risks

- TS 7.1 not stable yet. 7.0.2's watch is slow (measured above). The CLI text output is not a formal API, but it's the long-standing `tsc` format and is used with `--pretty false`.
- +31 MB install (one platform binary). Platform packages are optional dependencies: `--no-optional`/`--omit=optional` installs, or unusual platforms → detect and disable type checking with a warning.
- Generated tsconfig drift: future TS options removed or SPFx rig changes need generator updates. The es5-only diagnostics (TS2802 family) are missing compared to heft. A project with a nonstandard tsconfig might resolve differently with `bundler` than with `node10` (Fluent UI/PnPjs were fine).
- CPU contention on small machines: +30–60 ms per rebuild with `--singleThreaded` here (2 cores), more with multi-threaded tsgo.
- Watch on Windows/macOS not measured in this spike. Known 7.0 macOS FSEvents issues with very large `node_modules` trees.

## Reproduce

`/var/tmp/tscheck-research/proto/`: `flatten.mjs <project> <out.json> tsgo|ts5 [yes|no]`, `oneshot.sh`, `watchbench.mjs <project> tsgo|ts5 <runs>` (`TSGO_BIN` picks the binary), `serverbench.mjs <project> off|A|B|C <runs> <port>` (copies need `fast-serve/rspack.extend.mjs` from `proto/` and `tscheck-targets.json`; `TS7_DIR`, `TSGO_ARGS` env). Results: `results/oneshot.txt`, `watch.jsonl`, `watch71.jsonl`, `server.jsonl`, `server-start.jsonl`, `server71.jsonl`, `plants-*.txt`, `server-*.log`; `node proto/summarize.mjs <jsonl>` prints the medians.
