---
title: Linting saved files
type: feature
status: current
tags:
  - project-kb
  - lint
  - eslint
  - errors
---

# Linting saved files

## Summary

`fast-serve` lints the files saved during a session with the project's own ESLint 9 and flat config, in one long-lived child process, and prints the findings in the terminal only. On by default (`"lint": true`), with type-aware rules turned off; `"lint": "full"` uses the project's config as is (exact parity with heft's lint step); `"lint": false` turns it off. Lint findings never enter Rspack's compilation, the `rebuilt in …` lines, the page channel or any overlay, and linting never delays a rebuild or a hot update. The design (own runner instead of `eslint-rspack-plugin`, type-aware rules off by default) comes from a measured spike.

## Behavior

### Options and start

- `lint` in `fast-serve/config.json`: `true` (default), `"full"` or `false`. Flags: `--lint` (on), `--lint full` (also `--lint=full`), `--no-lint`; `--lint` together with `--no-lint` is an error, any other `--lint` value is an error. The start summary shows `lint on`, `lint on (full, with type-aware rules)` or `lint off`.
- For each code root (the project and every [linked library project](local-library-projects.md)) fast-serve looks for `eslint.config.js`, `.mjs` or `.cjs` in the root and for `eslint` in the root or the SPFx build rig (the same lookup as for other project tools), ESLint 9 or newer. Without them, the project prints `lint is off: <reason>` and a library prints `lint: <package> is not linted: <reason>`, each as one info line; nothing fails. Legacy `.eslintrc` configurations are not supported (SPFx 1.24 generates a flat config).
- An `ESLintRspackPlugin`, `ESLintWebpackPlugin` or `ESLintPlugin` instance in the merged config (from the [extend file](rspack-extend-file.md)) replaces fast-serve's lint: fast-serve prints `lint: using the <plugin> from the Rspack extend file (fast-serve's own lint is skipped)` and starts nothing.

### Process and lifecycle

- The lint process is forked when the first compile is done, loads ESLint and the config for each code root, and warms up by linting the first source file of each root in memory (results discarded): the config, plugins and parser (with `"full"` the TypeScript program) are ready before the first save. Nothing is linted at start.
- One ESLint instance per code root with that root as working directory and that root's ESLint, all in the same process. ESLint's cache is on (content strategy), one cache file per code root and mode under `temp/fast-serve/eslint`.
- The process ignores SIGINT (Ctrl+C reaches the whole process group) and exits when its IPC channel closes, so a dying server never leaves it behind. The dev server's stop hook and the compiler's `watchClose` kill it; a restart starts a new one after the new first compile, so a session keeps exactly one.
- Editing an `eslint.config.*` of a code root (content change) kills and restarts only the lint process (`lint: eslint.config.mjs changed, reloading ESLint`), not the session.
- A config that fails to load prints one error (`lint: ESLint could not load <config>, linting <root> is off until the file changes:` plus ESLint's message) and that root stays off until its config changes. A lint call that throws prints `lint: ESLint failed: <message>`, each message once. An unexpected exit of the process prints `lint stopped: the ESLint process exited (…)` with the tail of its stderr; linting then stays off until fast-serve restarts.

### What is linted and when

- Files come from a recursive watcher on each code root's source folder: `.ts`, `.tsx`, `.js`, `.jsx`, no declaration files, nothing under `node_modules`. That includes type-only files, which are not in the Rspack graph and never rebuild. A removed file is forgotten.
- Changes are collected for 50 ms after the watcher settles. While a compile runs (from Rspack's `invalid`/`watchRun` to `done`/`failed`) the batch waits for its end; one lint request per code root is in flight at a time and later saves queue up. So the lint of a saved component starts after its rebuild has sent the hot update.
- Files the config ignores (`isPathIgnored`, which also covers files no config object matches) are skipped.

### Type-aware rules off (default)

- For TypeScript files fast-serve appends typescript-eslint's `disable-type-checked` config, taken from the code root's `@typescript-eslint/eslint-plugin` (also found through `@microsoft/eslint-config-spfx` or `typescript-eslint`) or from `typescript-eslint`, and a config that sets `parserOptions` `project: false`, `projectService: false`, `program: null`.
- Generically, before linting a file it computes the file's config and turns off every enabled plugin rule whose metadata says `requiresTypeChecking`; a rule that still throws ESLint's "requires type information" error is turned off by the id in the message and the lint is retried. Both need no knowledge of the config.
- In the SPFx 1.24 config (the 1.23 config was not compared rule by rule; it uses the same ESLint 9.37) only `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-for-in-array` need types (both errors). The default therefore reports heft's lint findings minus those two; a clean serve can still meet a failing `heft build`.

### Terminal output

- Per linted file, when its findings differ from the last ones printed for it: `lint: <project-relative path>: <n> errors, <m> warnings`, then one line per finding sorted by position (`line:column`, `error`/`warning`, message, rule id), at most 20 plus `… and <n> more`. Library files are named relative to the project (`../corp-lib/src/…`). The block goes to the warning stream even with ESLint errors.
- A file whose findings disappear prints `lint: <path>: clean` once (info); a file that was clean from the start prints nothing; unchanged findings print nothing. A file ESLint can't parse keeps its last state and prints nothing (the compile error, or the type check for type-only files, covers syntax errors).

### Scope and limits

- Only saved files are linted: dependents of a changed file are not re-linted (that matters only for type-aware rules, i.e. `"full"`), and heft's lint step remains the full check.
- The SPFx config registers `react-hooks` without enabling any of its rules, so hook mistakes are reported neither by heft nor here.
- ESLint 10 (config lookup from the linted file by default) is untested.

## Implementation Notes

- One feature contributes a compiler plugin that only reports compile start and end and stops the runner; the watchers and the lint process start from a server-started hook after the first compile and stop with the server. The worker code has no runtime imports from the rest of the package.
- `typescript-eslint` packages resolve `typescript` as a peer; the package's own development install pins them to TypeScript 5 for the integration tests (the package itself builds with TypeScript 7).

## Edge Cases

- Saving within ≈1.3 s (default) or ≈4.5 s (`"full"`) after "ready" competes with the warm-up for CPU: that one rebuild is ≈0.05–0.1 s slower and the lint arrives when the warm-up is done (≈1.2 s / ≈3.6–4.5 s after the save).
- Files saved during a lint are linted in the next batch; files queued when ESLint reloads are linted after the reload, a request in flight at that moment is dropped.

## Links

- [Background type check](type-checking.md)
- [Errors, overlay and terminal output](errors-and-diagnostics.md)
- [CLI, options and startup](cli-and-options.md)
- [Local library component projects](local-library-projects.md)
- [Rspack extend file](rspack-extend-file.md)
- [Architecture overview](../architecture/overview.md)

## Evidence

- Source (2026-11-22, `1.24.0-beta.11`): unit tests (type-aware rule detection from metadata, the "requires type information" rule id, the appended configs, result mapping, change detection and output format, file selection, cache file names, option and flag parsing, ESLint lookup); integration tests with ESLint 9.37 and typescript-eslint 8.56 on a fixture with a type-aware rule, a custom rule that throws without type information and plain rules: a saved component reported once without the type-aware rules and without a change in the `rebuilt` line, an identical save quiet, the fix printed `clean` once, a type-only file linted without a `rebuilt` line, an ignored file skipped, a broken config reported and the fixed config reloaded without a restart, `"full"` after a restart reporting `no-floating-promises` with one lint process, `"lint": false` stopping it, compile gating with a real lint process, a linked library linted with its own config, an extend-file plugin replacing the lint, no process left after close.
- Parity on 16 planted issue kinds in a small SPFx 1.24.1 project (ESLint 9.37, `@microsoft/eslint-config-spfx` 1.24.1): heft's lint step 16 findings (4 errors); `"full"` the identical 16 (file, line, column, rule); default 14 (all but `no-floating-promises` and `no-for-in-array`), nothing heft doesn't report; two hook plants reported by none.
- Local numbers (2-core laptop, save → block printed, medians): small project (22 files) default 110–120 ms for a component or a type-only file, first save after the warm-up 120–140 ms, first save right after "ready" ≈1.2 s; `"full"` 125–160 ms, ≈3.6 s right after "ready"; 1000-module project default 105–150 ms, first save 190–215 ms, ≈1.3 s right after "ready"; `"full"` 150–215 ms, ≈4.5 s right after "ready". Rebuild times with lint on fell within the spread of lint off on both projects; a save right after "ready" rebuilt ≈0.05–0.1 s slower than the same save without lint. Lint process peak RSS 233–250 MB (default), 529–642 MB (`"full"`); server RSS unchanged.
- Live on SharePoint (small project, default flags): a component saved with an unused variable printed the `rebuilt` line and then the warning block; the hot update kept React state and a page marker, save → DOM 95–120 ms (91–116 ms with `--no-lint`), no overlay; the fix printed `clean`. With `--no-lint` the summary said `lint off`, no lint process ran and nothing was printed.
