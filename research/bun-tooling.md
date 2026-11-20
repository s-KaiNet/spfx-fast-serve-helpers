# Bun for tests and toolchain commands (research, 2026-11-20)

Question: can `bun test` replace vitest here, and can `bun check` / `bun lint` / `bun fmt` replace `tsc` / `oxlint` / a future `oxfmt`? Should the package manager change too?

All experiments ran on a copy of the Rspack worktree (`/var/tmp/bun-research/repo`, detached into its own git repo so the worktree index was never touched). The worktree itself only gets this file.

Machine: 4 cores, 22 GB RAM, Linux, Node 24.21.0, pnpm 12.11.2. Other agents were running at the same time (load average about 4), so the timings carry some noise.

## Versions

- Installed Bun: **1.4.5** (`1.4.5+a7733435c`), which is the latest stable release (2026-11-19, a security release). Bun reports `process.versions.node` 26.3.0 and `process.versions.typescript` 7.0.2.
- Canary checked separately: `1.4.6-canary.1+7bb427f3b`. It was downloaded to `/var/tmp/bun-research/canary`; the installed Bun was not changed.
- History: `bun check` arrived in 1.4.3 (2026-10-10) and is a port of typescript-go that matches TypeScript 7.0.2. `bun fmt` arrived in 1.4.4 (2026-10-22): it ports Prettier, with oxc_formatter as the JS/TS printer. `bun lint` is documented on bun.com/docs/lint but is **not in any stable release**; only canary has it.

## 1. `bun test` instead of vitest

### What the suite uses

- 51 test files, 321 tests. There is no `vitest.config`. Defaults apply: node environment, forks pool, isolation per file, no globals. Tests import explicitly from `'vitest'`.
- API surface used:
  - `describe`/`it`/`expect` and the hooks `beforeAll`/`afterAll`/`afterEach`/`beforeEach`.
  - `it.each` (1), `onTestFinished` (2), `vi.fn` (5), `vi.waitFor` (2), `vi.stubGlobal`/`vi.unstubAllGlobals` (2).
  - `expect.poll` (6), the asymmetric matchers `expect.arrayContaining`/`stringContaining`/`stringMatching`, and per-test timeouts as the third argument.
  - No snapshots, no `vi.mock`, no fake timers, no setup files, no `test.concurrent`.
- Node APIs used by the tests and the code under test:
  - `node:child_process` (`openssl`), `node:https`/`node:tls`/`node:net` (real HTTPS dev servers on free ports), `node:vm` (fake page that runs the AMD bundles), `node:module`.
  - From `node:module`: `createRequire` and `SourceMap`.
  - The native `@rspack/core` binding, `sass-embedded` (spawns the Dart Sass process), file watchers, global `fetch` and `WebSocket`.

### Result on Bun 1.4.5

Bun redirects `import … from 'vitest'` to its own runner, so the files run without edits.

| Step | Pass | Fail | Not run |
|---|---|---|---|
| Unchanged | 270 | 14 | 37 (a failing `beforeAll` hides the tests of 5 `describe` blocks) |
| + preload shim (`bunfig.toml` `[test] preload`) | 315 | 6 | 0 |
| + 3 small test changes | **321** | **0** | 0 |

The same changed copy also passes **321/321 under vitest**, including with `NODE_PATH` cleared (see the latent bug below).

Failures found, and the fix for each:

| # | Cause | Tests | Fix used |
|---|---|---|---|
| 1 | `vi.waitFor` missing in Bun's `vi` (it has `fn`, `spyOn`, `mock`, sync fake timers, but not `waitFor`, `stubGlobal`, `unstubAllGlobals` or `advanceTimersByTimeAsync`) | 2 | preload: small `vi.waitFor` |
| 2 | `vi.stubGlobal` / `vi.unstubAllGlobals` missing | 2 | preload: implemented on `globalThis` |
| 3 | `expect.poll` missing | 2 | preload: retrying proxy over `expect` |
| 4 | Bun's global `fetch` **ignores `tls.setDefaultCACertificates()`** (`DEPTH_ZERO_SELF_SIGNED_CERT`). Node's `fetch` and Bun's `https.get` honour it | `beforeAll` of 5 dev-server suites (37 tests hidden) | preload: wrap `fetch` to pass the certificates as Bun's `tls: { ca }` |
| 5 | Same for Bun's global `WebSocket`: the HMR client in the fake page could not connect, so every HMR test timed out after 20 s | 21 (after fix 4) | preload: `WebSocket` subclass passing `tls: { ca }` |
| 6 | `node:module` `SourceMap.findOrigin()` returns `{ line, column, fileName }` with `findEntry` semantics on Bun. Node returns `{ lineNumber, columnNumber, fileName }` with 1-based offsets. **This is in product code** (`browserErrors/sourceMaps.ts`): on Bun the browser-error column is `undefined` | 3 | preload: `findOrigin` re-implemented on top of `findEntry` with Node's formula |
| 7 | `createRequire(tmpFixture).resolve('@microsoft/sp-css-loader')` etc. fails: the tests copy fixtures to `/tmp` | 3 | linked the needed packages into the fixture copies (test change, below) |

About #7, a latent bug in today's suite: under vitest these resolutions only work because pnpm's `node_modules/.bin/vitest` shim exports `NODE_PATH=…/node_modules/.pnpm/node_modules`. The code then finds `@rushstack/heft` there and resolves the heft tools from it. `node node_modules/vitest/vitest.mjs run src/typescript/typescript.test.ts` (no pnpm shim) fails the same test today. Inside `bun test`, `createRequire().resolve` ignores `NODE_PATH` and `Module.globalPaths`, although `bun run` honours `NODE_PATH`. The fix makes the tests independent of the runner and of pnpm: a `linkHeftToolPackages(root)` helper in `testing/compileKit.ts` symlinks `@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin`, `@rushstack/heft-static-asset-typings-plugin`, `@rushstack/heft-config-file`, `@rushstack/rig-package` and `sass-embedded` into the fixture copy. It is called in `aces/extensionsAndAces.test.ts`, `externals/externals.test.ts` and the first test of `typescript/typescript.test.ts`. That is about 15 lines and is worth applying even if we stay on vitest.

The full list of shims and changes is kept in the copy, not here:
- `/var/tmp/bun-research/repo/bunfig.toml`
- `/var/tmp/bun-research/repo/bun-shim/preload.ts` (82 lines)
- `/var/tmp/bun-research/test-changes.diff`

What worked on Bun without changes:
- `@rspack/core` native binding (compiles, watch, persistent cache).
- `@rspack/dev-server` over HTTPS, `sass-embedded`, `node:vm`.
- `child_process` (`openssl`), `createRequire` in product code, ESM/CJS interop in the extend-file loader (`.mjs`/`.mts`/`.cjs`).
- File watchers, `it.each`, `onTestFinished`, `vi.fn` with `toHaveBeenCalledWith`, timeouts as the third argument.

### Timings

The commands were `pnpm -s test` vs `bun test` for the full suite (51 files, 321 tests). The unit subset is the 38 files that start no Rspack compile, dev server or dev session (238 tests). It still includes Sass, `tsc`-based and watcher tests.

"Cold" means the vitest caches (`node_modules/.vite`, `.vitest-cache`) and Bun's transpiler cache were cleared. The OS page cache was not dropped (no sudo). Each variant ran 4 times in a row: run 1 cold, runs 2–4 warm. All runs passed except one flaky vitest run, noted below.

| Suite | Runner | Cold (s) | Warm runs (s) | Warm mean (s) |
|---|---|---|---|---|
| full | vitest (default: isolate per file, 4 forks) | 21.80 | 19.84, 15.14, 15.61 (+ separate runs 15.46, 16.70) | ~16.5 |
| full | vitest `--no-isolate` | — | 7.49, 7.36, 7.19 | 7.35 |
| full | `bun test` (one process, files in sequence) | 12.88 | 12.86, 14.25, 14.19 | 13.77 |
| full | `bun test --parallel` (4 workers, isolated) | 7.72 | 6.75, 6.74, 6.89 | **6.79** |
| unit | vitest | 6.48 | 6.08, 6.20, 6.10 | 6.13 |
| unit | vitest `--no-isolate` | — | 2.65, 2.72, 2.67 | 2.68 |
| unit | `bun test` | 3.45 | 3.54, 3.32, 3.42 | 3.43 |
| unit | `bun test --parallel` | 2.27 | 2.24, 2.21, 2.18 | **2.21** |

Reading the numbers:
- Bun with `--parallel` is about 2.4× faster than vitest's defaults on the full suite and about 2.8× faster on the unit subset.
- **Most of that gap is vitest's per-file isolation.** vitest itself prints a hint about `isolate: false`. With `--no-isolate`, vitest is within about 0.5 s of `bun test --parallel` on both suites, and it passes 321/321 with no shims.
- Cold vs warm makes little difference for Bun. For vitest, the first run after clearing caches is about 5 s slower.
- Flakiness: one vitest run out of 7 extra full runs failed `browserErrorsServer.test.ts` ("timed out waiting for the runtime error overlay") under load, and once more in a loop of 3. That test was not touched by the changes. Bun runs did not fail, but there were fewer of them.

### Runtime risk

With `bun test`, the code under test runs **on Bun's runtime, not Node**; `bun test` cannot run tests on Node. Users run fast-serve on Node 22/24/26 (`engines`), next to heft. This research already found two runtime differences that matter: #4/#5 (TLS defaults for `fetch`/`WebSocket`) and #6 (`SourceMap.findOrigin` result), plus the module resolution difference in #7.

The shims hide these differences rather than test the Node behaviour. #6 is a real product bug that would only show on Bun, and a Bun test run would mask the opposite case: Node-only behaviour that breaks unnoticed. For a tool whose job is to run Node-side Rspack and heft packages exactly as on users' machines, testing on another runtime weakens the integration tests. If Bun were used, the suite would still need a Node run in CI (vitest) to be meaningful.

### Vite branch (`v1.24`, read only, not run)

The branch uses vitest the same way (39 test files) but leans on more APIs: `vi.fn` (35), `vi.spyOn` (7), `vi.waitFor` (8), `vi.mock` (1, a hoisted module mock in `devServer.test.ts`), `vi.useFakeTimers` with **`vi.advanceTimersByTimeAsync`** (9, missing in Bun's `vi`), `vi.stubGlobal`, `onTestFinished`, and `SourceMap.findOrigin` in product code. 18 test files start real Vite servers. Expect the same issues plus more shims: an async fake-timer advance, and hoisting semantics of `vi.mock`, which Bun implements differently. The conclusion is the same, and on that branch the code under test would also run Vite on Bun.

## 2. `bun check`, `bun lint`, `bun fmt`

### `bun check` (exists in 1.4.5): typescript-go port, check only

- Built in, Bun's own port of typescript-go matching TypeScript 7.0.2, the same version as our `typescript` devDependency. It runs no `tsc`/`tsgo` underneath and needs no `typescript` package.
- It reads `tsconfig.json`, follows `references` like `tsc -b`, and accepts `-p`. It never emits JS, `.d.ts` or `.tsbuildinfo`, so `pnpm build` keeps `tsc` for `tsconfig.build.json`, `tsconfig.runtime.json` and `tsconfig.types.json`.
- Our configs don't reference each other, so the equivalent of `pnpm -s typecheck` is `bun check -p tsconfig.json && bun check -p tsconfig.runtime.json`. Plain `bun check` only checks `tsconfig.json` (158 files) and would miss the runtime config (4 files).
- Parity: with planted errors (a TS2322 and a TS6133 in `src/logger.ts`, a TS2322 in a runtime file), both tools reported the same 3 errors with the same codes and positions. `--no-pretty` gives the `tsc --pretty false` format.
- If `package.json` had a `check` script, `bun check` would run that script instead. Ours is called `typecheck`, so no conflict.

### `bun lint`: not in stable; canary has a built-in that reads `.oxlintrc.json`

On 1.4.5 it is **not a command**. `bun lint` is just Bun's "run the script with this name" shortcut:

```
$ bun lint --help
$ oxlint --type-aware --deny-warnings --help
…
$ cd empty-dir && bun lint
error: Script not found "lint"
```

On 1.4.6-canary.1 it is a built-in linter ("Lint JavaScript and TypeScript, like ESLint"):
- It reads `.oxlintrc.json`. `--doctor` reports `Using .oxlintrc.json (oxlint config)`, 161 files, `277 rules run natively, 0 rules run in JavaScript`, and `You can remove: oxlint-tsgolint`.
- Its type-aware rules use `bun check` instead of tsgolint.
- With a `lint` script present it still runs the script, so measuring it needs `--no-script` (or a `"lint": "bun lint …"` script).
- Parity: with 4 planted problems (`no-var`, `eqeqeq`, `typescript/no-floating-promises`, `typescript/require-await`), canary and `oxlint` 1.94 reported the same 4 findings, and both exit 0 on the clean tree.
- It is a canary build, so not something to depend on yet.

### `bun fmt` (exists in 1.4.5): Bun's own port, output matches oxfmt 0.79

- Built in: a port of Prettier with a port of oxc_formatter for JS/TS. It doesn't call `oxfmt` or `prettier`.
- It reads `.oxfmtrc.json`, and with one present it formats like oxfmt. It also reads Prettier configs.
- Dry runs (on throwaway copies) on the repo, which has no formatter today:

| Config | Tool | Diff (whole repo) | Diff (`src` + `test` `*.ts`) | Time |
|---|---|---|---|---|
| none (Prettier defaults: width 80, double quotes) | `bun fmt` | 286 files, +14243/−6608 | 180 files, +11135/−4544 | 0.05 s |
| `.oxfmtrc.json` `{}` (oxfmt defaults, width 100) | `bun fmt` | 283 files, +10844/−6246 | 179 files, +8073/−4174 | 0.05 s |
| `.oxfmtrc.json` `{}` | `oxfmt` 0.79.0 (`pnpm dlx`) | 283 files, +10844/−6246 | 179 files, +8073/−4174 | 0.14 s (+1.1 s dlx) |
| `{"singleQuote": true, "printWidth": 160}` | `oxfmt` 0.79.0 | 171 files, +3010/−2114 | 71 files, +745/−235 | 0.14 s |
| same | `bun fmt` | identical to oxfmt | identical | 0.05 s |

- `bun fmt` and `oxfmt` produced byte-identical `src/` output for both configs.
- The current style is single quotes with long lines: 1290 of 12225 lines in `src` are longer than 100 characters and 152 longer than 160; the longest is 378.
- Even the closest config rewrites 71 TS files, mostly by splitting long object literals and calls. Without `ignorePatterns` for `kb/**`, `research/**` and `.agents/**`, it also reformats about 80 Markdown/JSON files there. Adding a formatter means one large formatting commit and agreeing on a width first.

### Tool timings

Warm runs, 3 each.

| Task | Today | Bun | Notes |
|---|---|---|---|
| typecheck (both configs) | `pnpm -s typecheck` (tsc 7.0.2): 0.60, 0.59, 0.58 s | `bun check -p tsconfig.json && bun check -p tsconfig.runtime.json`: 0.18, 0.16, 0.16 s | Same errors. Bun's own timing: 110 ms for 158 files and 40 ms for 4 files |
| lint (type-aware) | `pnpm -s lint` (oxlint 1.94 + tsgolint): 0.89, 0.79, 0.86 s | 1.4.5 `bun lint` = runs our script: 0.92, 0.89, 0.82 s. Canary `bun lint --no-script --type-aware --deny-warnings`: 0.25, 0.26, 0.26 s | Canary only |
| format | none | `bun fmt --check`: about 0.05 s | `oxfmt` direct: 0.14 s |

Absolute savings are under a second per command; the test suite is where the time goes.

## 3. Package manager

- `bun test`, `bun check` and `bun fmt` don't need Bun as the package manager. They work on the pnpm-installed `node_modules`, isolated `.pnpm` layout included (that is how every measurement above was made). Keeping pnpm and AGENTS.md as they are is fine.
- Commands that do write install state, all tried on throwaway copies:
  - `bun install` in a pnpm project **migrates `pnpm-lock.yaml` into a new `bun.lock`** ("migrated lockfile from pnpm-lock.yaml"). It leaves `package.json` and `pnpm-lock.yaml` alone, and `pnpm install --frozen-lockfile` afterwards still passes.
  - `bun update` **rewrites `package.json` ranges**: it changed `"sass-loader": "^17.1.0"` to `"^17.1.1"`, also updated webpack 5.112.2 → 5.113.0 in the lockfile, and wrote `bun.lock`. That is exactly the accidental change found in the worktree earlier, so the worktree most likely saw a `bun update` (or `bun add`).
  - `bun test`, `bun check`, `bun fmt`, `bun lint` and `bun run` changed neither `package.json`, `pnpm-lock.yaml` nor created `bun.lock` (checked with checksums). `bun fmt` would sort `package.json` only with `sortPackageJson = true`; the default is off.
- Switching to Bun as package manager would mean dropping `pnpm-lock.yaml` and `packageManager: pnpm@…` and changing AGENTS.md. Nothing in this research needs that.

## Recommendation

1. **Keep vitest** and run tests on Node, the runtime users have. For speed, try `isolate: false` (or `--no-isolate` for a fast local loop). It gave 7.35 s vs ~16.5 s full and 2.7 s vs 6.1 s unit, almost Bun's speed with no shims and no runtime switch. That needs a check that no test depends on fresh module state; all 321 passed in 3 runs here. Apply the fixture-linking change from #7 regardless: today the suite silently depends on pnpm's `NODE_PATH`.
2. `bun test` is **feasible but not advisable**: it needs an 82-line shim (missing `vi`/`expect` APIs, TLS for `fetch`/`WebSocket`, a `SourceMap.findOrigin` polyfill) and runs the product on a runtime it is not built for. It finds Bun-specific issues, not Node ones.
3. `bun check` can replace the `typecheck` script once Bun is a dev prerequisite: 3–4× faster, same errors. The gain is about 0.4 s, and `tsc` stays for `build`. `tsgo`/`tsc` 7 is already fast here, so low priority.
4. `bun lint`: not available in stable. Keep `oxlint --type-aware`, and reconsider when a stable release ships it (it reads our `.oxlintrc.json` and gave the same findings in canary).
5. Formatter: if wanted, use **`oxfmt`** directly (same family as oxlint, and the oxc VS Code extension already used in `.vscode/settings.json` can use it). Use a `.oxfmtrc.json` close to the current style (`singleQuote`, wide `printWidth`) and `ignorePatterns` for `kb/`, `research/`, `.agents/`. `bun fmt` produces the same output, so the choice doesn't lock us in. Expect a one-off diff of about 70 TS files.
6. Package manager: stay on pnpm. Never run `bun install`/`bun update`/`bun add` in the repo: they write `bun.lock`, and `bun update` rewrites `package.json` ranges.
