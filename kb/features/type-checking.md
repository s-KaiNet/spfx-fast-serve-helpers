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

A type check, on by default (`"typeCheck": false` in `fast-serve/config.json` or `--no-type-check` turns it off), runs the project's own TypeScript on the project's unchanged `tsconfig.json` in the background, through `ts-checker-rspack-plugin` `~1.8.0` (two worker processes per project). Results go to the terminal only when the set of issues changes, and, also by default (`"typeCheckOverlay": false` or `--no-type-check-overlay` turns it off), to a panel on the SharePoint page that is separate from the compile and runtime error overlay and collapses to one line while that overlay is open. Type issues never enter Rspack's compilation errors or warnings, the `rebuilt in …` lines or the compile overlay, and the check never blocks a rebuild or a hot update. Files the compiler can't build (syntax errors) are left to the compile error, so no syntax error is reported twice.

## Behavior

### Options and start

- `typeCheck` (`--no-type-check` / `--type-check`) and `typeCheckOverlay` (`--no-type-check-overlay` / `--type-check-overlay`); both default to `true`; each pair of flags together is an error; flags win over the options file. The overlay needs the check: an explicit `typeCheckOverlay: true` without `typeCheck` is ignored with a start warning; the default needs no warning. The start summary shows `type check off`, `on` or `on (with overlay)`. Memory is the cost of the default (≈0.7–1.2 GB for the two workers on large projects); the docs say how to turn it off.
- TypeScript comes from the project, then the SPFx build rig (the same lookup as other project tools). Type checking stays off with one line (`type check is off: …`): an info line when the project has no `tsconfig.json` or no TypeScript is found (normal for a JavaScript project, the server starts as usual), a warning when the found package is incomplete or it is TypeScript 7 or newer (no compiler API; the decision to use the project's own TypeScript 5 is recorded in the research behind this feature).
- `typescript` is an optional peer dependency of the package, so package managers link the project's TypeScript instead of installing another copy for the plugin; the plugin itself is a regular dependency, loaded only when the check is on.
- A `TsCheckerRspackPlugin` or `ForkTsCheckerWebpackPlugin` instance in the merged config (from the [extend file](rspack-extend-file.md)) replaces fast-serve's check: fast-serve prints `type check: using the <plugin> from the Rspack extend file (fast-serve's own type check is skipped)` and adds no checker of its own.

### Checker configuration

- `async: true`, `devServer: false` (both keep issues out of the compilation and the dev-server client), a silent logger, the `basic` formatter, `build: false`.
- `mode: 'write-tsbuildinfo'` in watch mode with `configOverwrite` setting only `incremental: true` and `tsBuildInfoFile` (`temp/fast-serve/typecheck.tsbuildinfo`); everything else is the project's tsconfig. The incremental info halves the time to the first result on big projects after a restart. TypeScript ignores info written by another TypeScript version, and the plugin drops it when `tsconfig.json` changes.
- `diagnosticOptions: { syntactic: true, semantic: true }`: syntactic diagnostics are needed for syntax errors in files outside the Rspack graph (type-only files such as props interfaces, whose imports SWC drops), which nothing else reports; turning them off would leave such errors silent (checked with TypeScript 5.8: a missing `}` in an interface file gives no semantic diagnostic). Measured on the 1000-module project they cost nothing visible.
- **Files the compiler can't build are left out:** after each compile fast-serve collects the files of modules that failed with a module build error (SWC's syntax errors; resolve errors don't count) and drops every type issue in those files before the change detection, the terminal and the panel. A syntax error in a component is therefore one compile error, not also `TS1005: '}' expected`; the file's type issues come back with the next check after it builds again. When a compile adds a file to that set, the last result is filtered again at once (in case the check finished first); when files leave it, the next check reports, so a stale syntax error is never printed after the fix.
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
- The panel is docked at the bottom of the page (≤ 45% of the height, scrollable) in its own shadow root, one per page; it closes when the check is clean; Esc or × hides it until the issues change. The page script is installed once per page and origin and does nothing without `EventSource`.
- **One overlay at a time:** the error overlay's page runtime announces every open and close with a window event (`fast-serve:error-overlay-changed`); its host element has a fixed id. The panel re-renders on the event (in a microtask) by looking up that element: while it exists the panel is a one-line bar (`[fast-serve] Type check: 1 error (also shown in the terminal) - click to show`), re-appended after the overlay so it stays visible above the backdrop (same top z-index, later in the document). Clicking the bar expands the full panel until the overlay element changes (a new error replaces it). When the overlay closes (rebuild, Esc, ×) the panel returns to full size; with no type issues nothing shows. Esc is handled by the panel in the capture phase and only when no error overlay is open, so Esc on an error overlay closes just that overlay (browsers run microtasks between listeners, so a bubble-phase check would see the overlay already gone). The signal is the DOM plus a window event, so it works with several bundles and any number of page runtimes; the terminal prints both kinds of errors unchanged.
- Event streams are ended when the server stops.

### Scope and limits

- Only the consumer project: [linked library projects](local-library-projects.md) are compiled from source, but the consumer's tsconfig sees their built declarations; checking library sources would need one checker per library root (two more workers each) and a way to attribute the shared issue hook to a root.
- Not a build: no linting (that is [Linting saved files](linting.md)), no emitted files except the incremental info; `heft build` stays the full check before packaging.
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
- [Linting saved files](linting.md)

## Evidence

- Source (2026-11-22, `1.24.0-beta.12`): page-script tests with both scripts on one fake page (compile overlay → bar, closed → full, runtime overlay → bar, click expands until the overlay changes, Esc closes only the overlay also when microtasks run between listeners, nothing without issues); integration test planting a syntax error in a component plus a semantic error elsewhere (only the semantic one is a type error; fails without the filter) and a syntax error in a type-only interface file (reported as a `TS1xxx` type error).
- Live on SharePoint (`1.24.0-beta.12`, small project, default flags): a missing `}` showed only the compile overlay (SWC `Expected '}'`), no panel and no type line in the terminal; the fix closed it. `escape1` showed the runtime overlay with the one-line bar; a mouse click expanded it; Esc closed the overlay and left the full panel, a second Esc hid it; the fix cleared both. A pure type error (`string` assigned to `number`) showed the full panel with the web part rendering. Rebuilds 56–139 ms.
- Source (2026-11-22, `1.24.0-beta.10`): unit tests (issue format, change detection, option parsing, TypeScript lookup, overlay page script with a fake page); integration test with a real dev session and TypeScript 5.8.3 on a fixture: clean first result, planted `escape1` reported once with a code frame and never as a compile error, an unrelated rebuild printing no type result, the fix printing `no errors`, overlay events over the event stream, a type-only save re-checked without a `rebuilt` line, a missing image import (`TS2307`) cleared after the image and its typing appear (fails with the typings feed removed), a restart with the incremental info file and two workers, none after close, an extend-file checker replacing fast-serve's.
- Local numbers (2-core laptop, medians of 3, times from process start or from the save): small project (22 files) first result 4.7 s cold / 4.3 s warm, after a restart 3.3 s, `escape1` reported 0.31 s and cleared 0.25 s, type-only error 0.37 s; 1000-module project first result 10.5 s cold / 5.5 s warm, after a restart 4.5 s, `escape1` 0.47 s / 0.35 s, widely used type 6.2 s; rebuilds 100–123 ms without and 166–212 ms with the check on the big project (no difference on the small one); process tree peak 0.33 → 0.99 GB (small) and 0.65 → 1.4 GB, up to 1.87 GB with widely-used-type edits and a restart (big).
- Live on SharePoint (small project, `--type-check --type-check-overlay`): `escape1` in a component printed the terminal block and showed the panel next to the runtime-error overlay; the fix printed `type check: no errors` and closed both; hot updates kept state, save → DOM 410–540 ms in the headless test browser versus 530–655 ms without the flag; without the flag `manifests.js` has no type-check script and the event-stream URL answers 404.
