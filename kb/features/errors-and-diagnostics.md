---
title: Errors, overlay and terminal output
type: feature
status: current
tags:
  - project-kb
  - errors
  - overlay
  - terminal
  - debugging
---

# Errors, overlay and terminal output

## Summary

Compile errors and warnings go to the `fast-serve` terminal with project-relative paths and to one error overlay over the SharePoint page. Runtime errors from project code (uncaught errors, unhandled rejections, `console.error`) are forwarded from the page to the terminal, source-mapped to `src/…:line` with a code frame; uncaught ones also open the overlay, and so do errors thrown while a module is evaluated (during a hot update or while a bundle loads). A bundle that fails to load gets a readable message in the web part's error box instead of SharePoint's `[object Object]`, with the cause (compile error, missing `config.json` external, missing SPFx library) in the terminal. Files of [linked library projects](local-library-projects.md) count as project code for all of this and are named relative to the project (`../corp-lib/src/…`). SharePoint's own errors stay in the browser console. Type errors come only from the optional [background type check](type-checking.md), with their own terminal blocks and page panel. All of it comes from a small page runtime that `fast-serve` puts at the top of its debug `manifests.js` and as the first module of every bundle; it guards itself per page, so it runs once, before any bundle code (from `manifests.js` in the debug-query flow, from the first bundle in [tunnel mode](tunnel-mode.md)).

## Behavior

### What is shown where

| Error | Terminal | Overlay | Web part error box |
|---|---|---|---|
| compile error / warning | yes (warnings too) | errors only | |
| bundle can't load: a module failed to compile | short line pointing at the compile error | the compile error | readable `[fast-serve]` message; page reloads after the fix |
| bundle can't load: `config.json` external or SPFx library script failed | yes, names the external (URL or path) or library (package, id, version) | | readable `[fast-serve]` message |
| bundle can't load: project code threw while loading | yes, source-mapped with code frame | yes | readable `[fast-serve]` message; page reloads after the fix |
| bundle can't load: a dependency threw while loading (no project frame) | yes | | readable `[fast-serve]` message |
| project module throws while a hot update evaluates it | yes, with a note that the page keeps the previous version | yes | |
| uncaught error / unhandled rejection from project code (also render errors of class and function components, after a hot update or F5) | yes, source-mapped with code frame | yes | |
| `console.error` from project code (strings or `Error` objects) | yes | no | |
| SharePoint / third-party errors, rejections without a stack | no | no | |

### Terminal

- Compile problems: `error in <path relative to the project>[:line:column]` (or `warning in …`) followed by Rspack's message with its code frame; the "Module build failed (from builtin:swc-loader)" wrapper is removed and the text dedented; identical problems are printed once.
- One summary line per compile: `compiled in 640 ms` at start, `rebuilt in 42 ms (src/…/Second.tsx)` afterwards (at most two changed files, then `+n more`), with `: 1 error, 2 warnings` appended only when there are any.
- **Quiet no-op rebuilds:** a rebuild that changed no module output prints nothing, not even its problems, unless the set of formatted errors and warnings differs from the last compile's. That covers a file saved without changes, a watched file outside the module graph (a type-only file a type checker adds to the watched files) and an invalidation without changes. A module counts as changed when it was rebuilt and its generated source (with source map) differs from its last known output; the last known output of a modified file's module is read from the previous compilation when the rebuild starts. A module that fails to build has no output and is rebuilt on every compilation; it counts as changed only when its file content changed, so a persistent error is not printed again on every no-op rebuild, while editing the broken file prints it again.
- Nothing else from Rspack or the dev server is printed (no banners, stats, progress or "Project is running at" lines, nothing on websocket connections or shutdown).
- Browser errors: `[Unhandled error] TypeError: …`, `[Unhandled rejection] …`, `[Hot update error] ReferenceError: …` (followed by the line `the page keeps running the previous version of this module until the error is fixed`), `[console.error] …` or `[Bundle load error] bundle "<name>" could not be loaded: <reason>`, then the frames as `> <function> src/…:line`, a code frame for the first project frame, and the stack cut after the last project frame. The same error repeated within 2 s is printed once (React reports a render error several times).

### Forwarding rule

- The page runtime sends only errors whose stack mentions a served bundle (`<origin>/dist/…`, the tunnel host in [tunnel mode](tunnel-mode.md)), each error object once, and skips the dev tooling's own console lines (`[rspack-dev-server]`, `[HMR]`, `[fast-serve]`).
- The server maps every frame in a served file through that file's source map and prints the report only when at least one frame maps to an existing file of the project outside `node_modules`. React DOM's "The above error occurred…" message, `@pnp/telemetry-js` failures and SharePoint's errors therefore stay in the browser console.
- Bundle load failures are always reported: SharePoint logs `Could not load <bundle> in require.` with the RequireJS error object; the runtime recognises the bundle names from the page's configuration.
- Bundles are loaded by SharePoint's RequireJS with a plain `<script>` from another origin, so the browser mutes errors thrown by their code: `window.onerror` gets only `Script error.` with no error object or stack. The page runtime therefore wraps RequireJS's `createNode` and sets `crossOrigin = "anonymous"` on script elements for served bundle URLs (the dev server already answers with `Access-Control-Allow-Origin: *`; hot-update chunks were already loaded that way through `crossOriginLoading`). In [tunnel mode](tunnel-mode.md) the runtime installs from the first bundle, so only later bundles get the attribute. Before this, errors from code in the initial bundle were silent (checked live for render errors after F5; event handlers in unedited code go through the same path); errors from hot-updated code were reported.
- Locations are `file:line` without a column: the development source maps are line-based (`cheap-module-source-map`), which keeps rebuilds fast.
- A frame on a generated line without a mapping of its own is mapped to the next mapped line, but only when the nearest mappings before and after it come from the same source file (so the line lies inside one module). This is the common case for render errors: React's development JSX transform puts `__source`/`__self: this` objects on lines without mappings, and V8 reports a `ReferenceError` in a JSX child expression (`{escape1(x)}`) at the preceding `__self: this`; the next mapped line is the child expression. Columns are dropped for such frames.
- Otherwise a frame is mapped only when its own generated line has a mapping. Lines Rspack generates itself (the `__webpack_require__` import lines of a module, for example) have none, and a nearest-previous lookup would attribute them to the end of whatever module precedes them in the bundle (seen: `SecondWebPart.ts` named as `HelloWorldWebPart.ts:40`); such frames stay `dist/<bundle>.js:<line>` and don't count as project frames.

### Errors while a module is evaluated

- A component module that throws at its top level during a hot update (e.g. `import … from '…';asdfsdf`, which compiles as an expression statement) never reaches `window.onerror`: React Fast Refresh's self-accept error handler catches it, logs it with `console.error(error)` and keeps the module accepted, so the previous version keeps rendering. Without special handling this looked like a plain `console.error` (terminal only) and the page showed no change at all.
- The page treats an `Error` object logged with `console.error` while any bundle on the page is in the HMR `apply` phase as a failed update: `[Hot update error]` in the terminal and the overlay `Updated module failed to run`. Each bundle's refresh entry tracks its own HMR status (`apply` → in the set of applying bundles; any other status → out), in a page-wide set the page runtime reads.
- `console.error` outside an update stays terminal-only, also with an `Error` object: project code logs errors it handled (failed requests in a `catch`), which must not cover the page. React's own "The above error occurred…" log is a string; the render error itself arrives as an uncaught error, so render errors behave as before.
- A module that is not a Fast Refresh boundary (web part class, a module exporting components and other values) makes the update fail and the page reload; the error then appears as a bundle load failure, with the overlay.

### Overlay

- One overlay per page, however many bundles (each with its own dev-server client) are on it, and also when SharePoint evaluates a failing bundle several times (seen: three times for one bundle with a syntax error).
- Compile errors: shown when a rebuild fails, closed when the next rebuild starts; runtime errors: the server's formatted text (message, project location, code frame). A runtime error never replaces a compile error that is shown.
- A runtime-error overlay closes on the first successful rebuild with new output after an edit: the dev-server clients post `webpackInvalid` and then `webpackOk`, or `webpackWarnings` when the build has only warnings (the client never posts `webpackOk` then). If the updated code throws again (Fast Refresh re-renders the component, or the handler runs again), the overlay opens again. It stays open on a client's initial `ok` (a bundle connecting later) and on `still-ok` (nothing changed, so nothing re-runs). An answer for an error reported before the update is ignored, and an identical overlay is not redrawn.
- The server answers a repeated error with the overlay content again and only skips printing it to the terminal, so an error that survives an edit is shown again.
- Esc, × or a click outside closes it. `--no-overlay` or `"overlay": false` in `fast-serve/config.json` turns it off for compile and runtime errors; the terminal and browser console still get them. The overlay's footer names that option.

### Bundle load failures

- When project code threw while the bundle was evaluated (RequireJS `define` error carrying the original error and stack), the formatted report also opens the overlay (`Bundle load error`); compile failures and missing externals or libraries don't (the compile error has its own overlay, the others have no code location).
- The readable message replaces `[object Object]` in the error boxes of the bundle's web parts for a minute after the failure, e.g. `[fast-serve] bundle "hello-world-web-part" could not be loaded: a module in it failed to compile; the page reloads after the fix. Details are in the fast-serve terminal.`
- After a load failure the page reloads on the first successful rebuild that follows a change, also a build with only warnings; because the dev server sends a build's warnings before its errors, that reload waits 100 ms and is cancelled when errors follow.
- A missing `config.json` external is named with its URL or path and the advice to check `config/config.json` and that SharePoint can reach it (the tenant CSP blocks most CDNs, as with heft).

## Implementation Notes

- The page runtime is a plain script prepended to the rendered `manifests.js` (wrapped so that a failure to start can never break manifest loading) and compiled into every bundle as its first entry module; a page-wide symbol per origin lets only the first copy install. The `manifests.js` copy keeps load errors of bundles that never evaluate readable in the debug-query flow. It wraps `console.error`, listens to `error`, `unhandledrejection` and the `webpackErrors` / `webpackInvalid` / `webpackOk` / `webpackStillOk` window messages that every dev-server client posts, and draws the overlay in a shadow root.
- Reports are POSTed as `text/plain` to `https://localhost:<port>/fast-serve/browser-errors` (CORS); the answer carries the overlay content or the page message, so formatting and hints live in one place on the server.
- Source maps are read from the dev server's in-memory output (bundles and hot-update files) and parsed with Node's `SourceMap`; the cache is dropped on every compile.
- The dev server's own overlay is turned off.

## Edge Cases

- A runtime error inside a dependency without any project frame on the stack is not forwarded, even when project code triggered it asynchronously.
- A typo in a React hook name (`React.useState1`, `useState1` without an import, `import { useState1 } from 'react'`) is a runtime error, never a compile error: React comes in as an external, so Rspack can't check its exports; only the optional [background type check](type-checking.md) reports it before the code runs.
- An overlay closes after any successful rebuild with new output, also when the edit didn't touch the failing code; the error comes back only when that code runs again.
- An external whose script fails to load prevents the bundle from running at all; only the page runtime sees it, so the reason is reported but nothing reloads automatically (fixing `config/config.json` needs a restart).

## Links

- [Dev server, debug manifests and debug URL](dev-server.md)
- [Background type check](type-checking.md)
- [HMR and React Fast Refresh](hmr.md)
- [CLI, options and startup](cli-and-options.md)
- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source (2026-11-22, `1.24.0-beta.9`): integration test with a real dev server: saving a watched type-only file (zero built modules), an invalidation without changes, and saving a component without changes print nothing; a whitespace edit, a new syntax error, an edit of the still-broken file and the fix each print; an invalidation while the error persists prints nothing. Local on copies of the small test project and the 1000-module project: saving a `.tsx` or `.module.scss` without changes printed no `rebuilt` line (before: `rebuilt in 90 ms (…)`), a real edit still printed one.

- Source (2026-11-20, `1.24.0-beta.6`, live on a spfx-rea copy with a generator-style class component): `{escape(description)}` → `{escape1(description)}`. Before: hot update → web part content blank, only React's "The above error occurred…" in the console, nothing in the terminal, no overlay (the error reached the page runtime and the server, but its only project frame was V8's position on an unmapped `__self: this` line, so the report was dropped); F5 → the same, and the page runtime saw only `Script error.` (cross-origin script without `crossorigin`); the same edit in a function component behaved identically. After: hot update and F5 → overlay and terminal `HelloWorld.render src/…/HelloWorld.tsx:23` with code frame; fix → renders again without a reload; function component the same; Fast Refresh with state kept unchanged. heft start for the same edit: TS2552 in the terminal, page reload, blank web part, error object in the browser console, no overlay.

- Source (2026-11-20, `1.24.0-rspack.18`, live on a spfx-rea copy): `…;asdfsdf` appended to an import line of a function component: before, hot update → terminal `[console.error] ReferenceError…`, no overlay, old component kept rendering (logged by Fast Refresh's self-accept error handler inside the HMR runtime's apply step); F5 → readable error boxes and terminal load error without overlay, with misattributed frames. After: hot update → overlay with `Second.tsx:1` and code frame, state of the old component kept; fix → overlay closed, Fast Refresh with state kept, no reload; F5 → overlay `Bundle load error` plus readable error boxes, frames correct, reload after the fix; same edit in the web part class → reload → load-error overlay; `console.error('…', 42)` and `console.error(new Error(…))` in an `onClick` → terminal only; `React.useState1` render error → `Uncaught runtime error` overlay as before, closed after the fix.
- Source: implementation behaviour, unit tests, integration test with a real dev server and a fake page with two bundles; live on SharePoint Online with spfx-rea and spfx-bench copies (2026-11-19): syntax error → one overlay (Rspack's overlay showed three), cleared after the fix; throw in an `onClick` and in a render → terminal `Second.tsx:12` / `:9` with code frame, printed once; syntax error at page load → readable error boxes and reload after the fix; missing external URL → named in terminal and error boxes; two bundles on one page → one overlay.
- Source (2026-11-20, `1.24.0-rspack.12`, live on a spfx-rea copy): runtime-error overlays from `React.useState1`, `useState1` and `import { useState1 }` stayed after the fix before the change; afterwards they close after the fix, re-open after an edit that keeps the error, close with state kept after an `onClick` error fix, and close after a fix whose build has one warning; dev-server client sends `webpackWarnings` without `webpackOk` for warnings-only builds (read from `@rspack/dev-server` 2.2.2).
- Confidence: high
- Last checked: 2026-11-22 (`1.24.0-beta.9`)
