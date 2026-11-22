---
title: Background type check
type: feature
status: current
tags:
  - project-kb
  - typescript
  - type-check
  - errors
---

# Background type check

## Summary

An opt-in type check (`"typeCheck": true` in `fast-serve/config.json` or `--type-check`) runs the project's own TypeScript on the project's unchanged `tsconfig.json` in the background, through `ts-checker-rspack-plugin` `~1.8.0` (two worker processes per project). Results go to the terminal only when the set of issues changes, and optionally (`"typeCheckOverlay": true` or `--type-check-overlay`) to a panel on the SharePoint page that is separate from the compile and runtime error overlay. Type issues never enter Rspack's compilation errors or warnings, the `rebuilt in …` lines or the compile overlay, and the check never blocks a rebuild or a hot update. Default: off.

## Behavior

### Options and start

- `typeCheck` (`--type-check` / `--no-type-check`, the two flags together are an error) and `typeCheckOverlay` (`--type-check-overlay`); both default to `false`. The overlay needs the check: `typeCheckOverlay` without `typeCheck` is ignored with a start warning. The start summary shows `type check off`, `on` or `on (with overlay)`.
- TypeScript comes from the project, then the SPFx build rig (the same lookup as other project tools). Type checking stays off with one warning (`type check is off: …`) when the project has no `tsconfig.json`, when no TypeScript is found, when the found package is incomplete, or when it is TypeScript 7 or newer (no compiler API; the decision to use the project's own TypeScript 5 is recorded in the research behind this feature).
- `typescript` is an optional peer dependency of the package, so package managers link the project's TypeScript instead of installing another copy for the plugin; the plugin itself is a regular dependency, loaded only when the check is on.
- A `TsCheckerRspackPlugin` or `ForkTsCheckerWebpackPlugin` instance in the merged config (from the [extend file](rspack-extend-file.md)) replaces fast-serve's check: fast-serve prints `type check: using the <plugin> from the Rspack extend file (fast-serve's own type check is skipped)` and adds no checker of its own.

### Checker configuration

- `async: true`, `devServer: false` (both keep issues out of the compilation and the dev-server client), a silent logger, the `basic` formatter, `build: false`.
- `mode: 'write-tsbuildinfo'` in watch mode with `configOverwrite` setting only `incremental: true` and `tsBuildInfoFile` (`temp/fast-serve/typecheck.tsbuildinfo`); everything else is the project's tsconfig. The incremental info halves the time to the first result on big projects after a restart. TypeScript ignores info written by another TypeScript version, and the plugin drops it when `tsconfig.json` changes.
- `diagnosticOptions: { syntactic: true, semantic: true }`: syntactic diagnostics also show syntax errors in files outside the Rspack graph (type-only files), as heft does; measured on the 1000-module project they cost nothing visible (first result, error in a component and widely used type within noise).
- Default memory limit of the plugin (8 GB heap per worker).

### Scheduling

- **First check held until the first compile is done:** the plugin's `start` hook waits for the first `done`; ≈100 ms later fast-serve invalidates the compiler once, so the plugin registers its dependencies and delivers the first result without delaying "ready".
- **Generated typings fed into the check:** the plugin's TypeScript system learns about file changes only from Rspack's watcher; SCSS and static asset typings live outside the Rspack graph and the tsconfig `include` (read through `rootDirs`), so their changes never arrive and a missing typing's failed lookup stays forever (`Cannot find module './X.module.scss'` on a fresh clone, a stale `Property 'newClass' does not exist` after adding a class). fast-serve listens to the typings updates of the [page channel](../architecture/overview.md#features-and-the-page-channel), adds written typings to the next check's changed files and removed ones to its deleted files, and invalidates the compiler after a 100 ms debounce.
- **Type-only files:** the plugin adds the program's files to the watched files, so saving a type-only file (interfaces, `import type` targets) triggers a rebuild that changes no module; it prints no `rebuilt` line (quiet no-op rebuilds, see [Errors](errors-and-diagnostics.md)) and the check reports the new result.
- Only the latest check of a burst delivers a result; superseded checks deliver nothing.

### Terminal output

- On every result the plugin passes the complete list of issues. fast-serve compares a key of the sorted issues (file, line, column, code, severity, message) with the last one and prints only on a change; the first result always prints, so a clean start shows `type check: no errors` once.
- A printed result lists each issue as `type error in <project-relative path>:<line>:<column>` (or `type warning`), `<code>: <message>` (TypeScript's multi-line message chains kept) and a code frame from the current file content, sorted by file and position, at most 20 issues plus `… and <n> more type issues (heft build lists them all)`; then the summary `type check: <n> errors[, <m> warnings]` or `type check: no errors`. Error blocks and the error summary go to the error stream, a clean summary to the info stream.
- Worker failures (the plugin's `error` hook, e.g. out of memory) print `type check stopped: <message>`, each message once until the next result; after the compiler closed they are ignored.

### Overlay

- With `typeCheckOverlay`, a page script part in the debug `manifests.js` opens an `EventSource` to `<origin>/fast-serve/type-check` (CORS, `text/event-stream`, reconnect after 2 s). The script part exists only in `manifests.js`, so in [tunnel mode](tunnel-mode.md), where pages load no debug manifests, there is no panel; the terminal output is the same. Every new result is pushed as `{ title, text }` while there are issues and `null` when clean; a connecting page gets the current state at once.
- The panel is docked at the bottom of the page (≤ 45% of the height, scrollable) in its own shadow root, one per page, below the compile/runtime overlay in stacking order; it closes when the check is clean; Esc or × hides it until the issues change. The page script is installed once per page and origin and does nothing without `EventSource`.
- Event streams are ended when the server stops.

### Scope and limits

- Only the consumer project: [linked library projects](local-library-projects.md) are compiled from source, but the consumer's tsconfig sees their built declarations; checking library sources would need one checker per library root (two more workers each) and a way to attribute the shared issue hook to a root.
- Not a build: no linting, no emitted files except the incremental info; `heft build` stays the full check before packaging.
- TypeScript is loaded once in the main process when the plugin is applied (the plugin reads its version): the first start of a process is ≈0.2 s slower; restarts are not.
- A type-only save still sends the page a hot update without modules (only the runtime hash), which closes an open runtime-error overlay.

## Implementation Notes

- One feature contributes a plugin that, when applied, looks for another checker in the compiler's plugin list, loads `ts-checker-rspack-plugin` lazily, applies it, taps its `start`, `issues` and `error` hooks and connects the page channel's typings updates; with the overlay on it also contributes the event-stream middleware and the page script part.
- Workers are forked by the plugin and terminated on the compiler's `watchClose`: restarts keep exactly two workers alive, Ctrl+C leaves none (checked by the integration test and on the test projects).

## Edge Cases

- A file read while an editor writes it in place can produce a transient `… is not a module` issue until the file is saved again (seen once under heavy load during the research).
- SIGKILL of fast-serve during a check leaves a busy worker running until that check ends; it prints one `[type-check] Skipped because the parent process exited` line.

## Links

- [Errors, overlay and terminal output](errors-and-diagnostics.md)
- [TypeScript and tsconfig](typescript-and-tsconfig.md)
- [Styles, theme tokens and typings](styles-and-typings.md)
- [CLI, options and startup](cli-and-options.md)
- [Architecture overview](../architecture/overview.md)
- [Tunnel mode (TunnelServePlugin)](tunnel-mode.md)

## Evidence

- Source (2026-11-22, `1.24.0-beta.10`): unit tests (issue format, change detection, option parsing, TypeScript lookup, overlay page script with a fake page); integration test with a real dev session and TypeScript 5.8.3 on a fixture: clean first result, planted `escape1` reported once with a code frame and never as a compile error, an unrelated rebuild printing no type result, the fix printing `no errors`, overlay events over the event stream, a type-only save re-checked without a `rebuilt` line, a missing image import (`TS2307`) cleared after the image and its typing appear (fails with the typings feed removed), a restart with the incremental info file and two workers, none after close, an extend-file checker replacing fast-serve's.
- Local numbers (2-core laptop, medians of 3, times from process start or from the save): small project (22 files) first result 4.7 s cold / 4.3 s warm, after a restart 3.3 s, `escape1` reported 0.31 s and cleared 0.25 s, type-only error 0.37 s; 1000-module project first result 10.5 s cold / 5.5 s warm, after a restart 4.5 s, `escape1` 0.47 s / 0.35 s, widely used type 6.2 s; rebuilds 100–123 ms without and 166–212 ms with the check on the big project (no difference on the small one); process tree peak 0.33 → 0.99 GB (small) and 0.65 → 1.4 GB, up to 1.87 GB with widely-used-type edits and a restart (big).
- Live on SharePoint (small project, `--type-check --type-check-overlay`): `escape1` in a component printed the terminal block and showed the panel next to the runtime-error overlay; the fix printed `type check: no errors` and closed both; hot updates kept state, save → DOM 410–540 ms in the headless test browser versus 530–655 ms without the flag; without the flag `manifests.js` has no type-check script and the event-stream URL answers 404.
