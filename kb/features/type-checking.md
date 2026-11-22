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

A type check, on by default (`"typeCheck": false` in `fast-serve/config.json` or `--no-type-check` turns it off), runs the project's own TypeScript on the project's unchanged `tsconfig.json` in the background, through `ts-checker-rspack-plugin` `~1.8.0` (two worker processes per project). Results go to the terminal only when the set of issues changes and, unless the error overlay is off (`"overlay": false` / `--no-overlay`, the one switch for all on-page error UI), to the page's [error overlay](errors-and-diagnostics.md) as its lowest-priority source, after compile and runtime errors. Type issues never enter Rspack's compilation errors or warnings, the `rebuilt in …` lines or the compile overlay, and the check never blocks a rebuild or a hot update. Files the compiler can't build (syntax errors) are left to the compile error, so no syntax error is reported twice.

## Behavior

### Options and start

- `typeCheck` (`--no-type-check` / `--type-check`) defaults to `true`; both flags together are an error; flags win over the options file. It only decides whether the check runs; whether type errors appear on the page is `overlay`'s decision (`overlay: false` with the check on means terminal only). There is no separate overlay option (an unpublished beta had `typeCheckOverlay`; it is now an unknown key like any other). The start summary shows `type check off` or `on`. Memory is the cost of the default (≈0.7–1.2 GB for the two workers on large projects); the docs say how to turn it off.
- TypeScript comes from the project, then the SPFx build rig (the same lookup as other project tools). Type checking stays off with one line (`type check is off: …`): an info line when the project has no `tsconfig.json` or no TypeScript is found (normal for a JavaScript project, the server starts as usual), a warning when the found package is incomplete or it is TypeScript 7 or newer (no compiler API; the decision to use the project's own TypeScript 5 is recorded in the research behind this feature).
- `typescript` is an optional peer dependency of the package, so package managers link the project's TypeScript instead of installing another copy for the plugin; the plugin itself is a regular dependency, loaded only when the check is on.
- A `TsCheckerRspackPlugin` or `ForkTsCheckerWebpackPlugin` instance in the merged config (from the [extend file](rspack-extend-file.md)) replaces fast-serve's check: fast-serve prints `type check: using the <plugin> from the Rspack extend file (fast-serve's own type check is skipped)` and adds no checker of its own.

### Checker configuration

- `async: true`, `devServer: false` (both keep issues out of the compilation and the dev-server client), a silent logger, the `basic` formatter, `build: false`.
- `mode: 'write-tsbuildinfo'` in watch mode with `configOverwrite` setting only `incremental: true` and `tsBuildInfoFile` (`temp/fast-serve/typecheck.tsbuildinfo`); everything else is the project's tsconfig. The incremental info halves the time to the first result on big projects after a restart. TypeScript ignores info written by another TypeScript version, and the plugin drops it when `tsconfig.json` changes.
- `diagnosticOptions: { syntactic: true, semantic: true }`: syntactic diagnostics are needed for syntax errors in files outside the Rspack graph (type-only files such as props interfaces, whose imports SWC drops), which nothing else reports; turning them off would leave such errors silent (checked with TypeScript 5.8: a missing `}` in an interface file gives no semantic diagnostic). Measured on the 1000-module project they cost nothing visible.
- **Files the compiler can't build are left out:** after each compile fast-serve collects the files of modules that failed with a module build error (SWC's syntax errors; resolve errors don't count) and drops every type issue in those files before the change detection, the terminal and the overlay. A syntax error in a component is therefore one compile error, not also `TS1005: '}' expected`; the file's type issues come back with the next check after it builds again. When a compile adds a file to that set, the last result is filtered again at once (in case the check finished first); when files leave it, the next check reports, so a stale syntax error is never printed after the fix.
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

- With the check running and `overlay` on, the page runtime config carries the event-stream URL `<origin>/fast-serve/type-check` (CORS, `text/event-stream`, `Cache-Control: no-cache, no-store, no-transform`, `X-Accel-Buffering: no`, reconnect after 2 s). Every new result is pushed as `{ title, text }` while there are issues and `null` when clean; a connecting page gets the current state at once. Without the check (option off, or no usable TypeScript found) or with the overlay off, the URL is left out and the endpoint doesn't exist.
- The page runtime (one per page, see [Errors, overlay and terminal output](errors-and-diagnostics.md)) opens one `EventSource` and feeds the results into the error overlay as its third source. Because that runtime is also the first module of every bundle, type errors reach the page in [tunnel mode](tunnel-mode.md) too, through the tunnel host.
- **Transport choice:** the event stream, not the dev-server websocket. The dev-server client forwards only its fixed message types to the page (custom messages would have to piggyback on an unrelated type such as progress updates), and a page that connects later would need the current state replayed through the dev server's internals; the event stream gives the current state on connect, reconnects by itself and goes through the same host as the bundles.
- **Priority and closing:** see the error overlay rules (compile, then runtime, then type; lower sources listed as `Also: …`; Esc/×/backdrop close everything shown and hide the current type issues until they change; a clean check closes the type part and resets the hiding).
- Event streams are ended when the server stops.

### Scope and limits

- Only the consumer project: [linked library projects](local-library-projects.md) are compiled from source, but the consumer's tsconfig sees their built declarations; checking library sources would need one checker per library root (two more workers each) and a way to attribute the shared issue hook to a root.
- Not a build: no linting (that is [Linting saved files](linting.md)), no emitted files except the incremental info; `heft build` stays the full check before packaging.
- TypeScript is loaded once in the main process when the plugin is applied (the plugin reads its version): the first start of a process is ≈0.2 s slower; restarts are not.
- A type-only save still sends the page a hot update without modules (only the runtime hash), which closes an open runtime-error overlay.

## Implementation Notes

- One feature contributes a plugin that, when applied, looks for another checker in the compiler's plugin list, loads `ts-checker-rspack-plugin` lazily, applies it, taps its `start`, `issues` and `error` hooks and connects the page channel's typings updates; with the overlay on it also contributes the event-stream middleware. The error-forwarding feature asks the type-check feature for the event-stream URL (check on, overlay on, TypeScript found) when it renders the page runtime config.
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

- Source (2026-11-23, `1.24.0-beta.21`): page-runtime tests with a fake event stream (type errors open the overlay and close on clean, one stream per page with several runtime copies, Esc/× hide until changed, compile and runtime errors win with `Also:` lines and the type errors return after the fix or the next update, compile over runtime over type, nothing without the overlay or the URL); integration tests: a normal session's `manifests.js` and every bundle carry the URL once and a fake page loading all of them opens one stream, with `overlay: false` the URL is gone and the endpoint answers 404; a tunnel-mode session with a fake host: each bundle carries the tunnel-origin URL once, a bundles-only fake page shows a planted type error in the overlay and closes it on the fix, event-stream headers as above, no URL after restarts with `overlay: false` or `typeCheck: false`.
- Live on SharePoint (2026-11-23, `1.24.0-beta.21`, debug query, small project): a type error in a props interface opened the overlay (amber, `Type check: 1 error`, code frame) with the web parts rendering; a missing `}` in a component showed the compile overlay with `Also: Type check: 1 error` and no `TS1005`; the fix brought back the type overlay; Esc hid it; a second type error reopened it (`2 errors`); the fix closed it. Local tunnel-mode run with a fake host (no tunnel started): all five bundles carry the tunnel-origin URL and the page-runtime guard once; the event stream requested with the tunnel `Host` header and `Accept-Encoding: gzip` streamed uncompressed `null` → the error → `null`.
- Source (2026-11-22, `1.24.0-beta.12`): integration test planting a syntax error in a component plus a semantic error elsewhere (only the semantic one is a type error; fails without the filter) and a syntax error in a type-only interface file (reported as a `TS1xxx` type error).
- Source (2026-11-22, `1.24.0-beta.10`): unit tests (issue format, change detection, option parsing, TypeScript lookup, page script with a fake page); integration test with a real dev session and TypeScript 5.8.3 on a fixture: clean first result, planted `escape1` reported once with a code frame and never as a compile error, an unrelated rebuild printing no type result, the fix printing `no errors`, overlay events over the event stream, a type-only save re-checked without a `rebuilt` line, a missing image import (`TS2307`) cleared after the image and its typing appear (fails with the typings feed removed), a restart with the incremental info file and two workers, none after close, an extend-file checker replacing fast-serve's.
- Local numbers (2-core laptop, medians of 3, times from process start or from the save): small project (22 files) first result 4.7 s cold / 4.3 s warm, after a restart 3.3 s, `escape1` reported 0.31 s and cleared 0.25 s, type-only error 0.37 s; 1000-module project first result 10.5 s cold / 5.5 s warm, after a restart 4.5 s, `escape1` 0.47 s / 0.35 s, widely used type 6.2 s; rebuilds 100–123 ms without and 166–212 ms with the check on the big project (no difference on the small one); process tree peak 0.33 → 0.99 GB (small) and 0.65 → 1.4 GB, up to 1.87 GB with widely-used-type edits and a restart (big).
- Live on SharePoint (small project, type check on): hot updates kept state, save → DOM 410–540 ms in the headless test browser versus 530–655 ms without the check.
