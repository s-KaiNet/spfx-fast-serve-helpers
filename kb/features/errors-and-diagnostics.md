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

Compile errors and warnings go to the `fast-serve` terminal with project-relative paths and to one error overlay over the SharePoint page. Runtime errors from project code (uncaught errors, unhandled rejections, `console.error`) are forwarded from the page to the terminal, source-mapped to `src/…:line` with a code frame; uncaught ones also open the overlay. A bundle that fails to load gets a readable message in the web part's error box instead of SharePoint's `[object Object]`, with the cause (compile error, missing `config.json` external, missing SPFx library) in the terminal. Files of [linked library projects](local-library-projects.md) count as project code for all of this and are named relative to the project (`../corp-lib/src/…`). SharePoint's own errors stay in the browser console. All of it comes from a small page runtime that `fast-serve` puts at the top of its debug `manifests.js`, so it runs once per page before any bundle.

## Behavior

### What is shown where

| Error | Terminal | Overlay | Web part error box |
|---|---|---|---|
| compile error / warning | yes (warnings too) | errors only | |
| bundle can't load: a module failed to compile | short line pointing at the compile error | the compile error | readable `[fast-serve]` message; page reloads after the fix |
| bundle can't load: `config.json` external or SPFx library script failed | yes, names the external (URL or path) or library (package, id, version) | | readable `[fast-serve]` message |
| bundle can't load: its code threw while loading | yes, source-mapped with code frame | | readable `[fast-serve]` message |
| uncaught error / unhandled rejection from project code | yes, source-mapped with code frame | yes | |
| `console.error` from project code | yes | no | |
| SharePoint / third-party errors, rejections without a stack | no | no | |

### Terminal

- Compile problems: `error in <path relative to the project>[:line:column]` (or `warning in …`) followed by Rspack's message with its code frame; the "Module build failed (from builtin:swc-loader)" wrapper is removed and the text dedented; identical problems are printed once.
- One summary line per compile: `compiled in 640 ms` at start, `rebuilt in 42 ms (src/…/Second.tsx)` afterwards (at most two changed files, then `+n more`), with `: 1 error, 2 warnings` appended only when there are any.
- Nothing else from Rspack or the dev server is printed (no banners, stats, progress or "Project is running at" lines, nothing on websocket connections or shutdown).
- Browser errors: `[Unhandled error] TypeError: …`, `[Unhandled rejection] …`, `[console.error] …` or `[Bundle load error] bundle "<name>" could not be loaded: <reason>`, then the frames as `> <function> src/…:line`, a code frame for the first project frame, and the stack cut after the last project frame. The same error repeated within 2 s is printed once (React reports a render error several times).

### Forwarding rule

- The page runtime sends only errors whose stack mentions a served bundle (`https://localhost:<port>/dist/…`), each error object once, and skips the dev tooling's own console lines (`[rspack-dev-server]`, `[HMR]`, `[fast-serve]`).
- The server maps every frame in a served file through that file's source map and prints the report only when at least one frame maps to an existing file of the project outside `node_modules`. React DOM's "The above error occurred…" message, `@pnp/telemetry-js` failures and SharePoint's errors therefore stay in the browser console.
- Bundle load failures are always reported: SharePoint logs `Could not load <bundle> in require.` with the RequireJS error object; the runtime recognises the bundle names from the page's configuration.
- Locations are `file:line` without a column: the development source maps are line-based (`cheap-module-source-map`), which keeps rebuilds fast.

### Overlay

- One overlay per page, however many bundles (each with its own dev-server client) are on it, and also when SharePoint evaluates a failing bundle several times (seen: three times for one bundle with a syntax error).
- Compile errors: shown when a rebuild fails, closed when the next rebuild starts; runtime errors: the server's formatted text (message, project location, code frame). A runtime error never replaces a compile error that is shown.
- A runtime-error overlay closes on the first successful rebuild with new output after an edit: the dev-server clients post `webpackInvalid` and then `webpackOk`, or `webpackWarnings` when the build has only warnings (the client never posts `webpackOk` then). If the updated code throws again (Fast Refresh re-renders the component, or the handler runs again), the overlay opens again. It stays open on a client's initial `ok` (a bundle connecting later) and on `still-ok` (nothing changed, so nothing re-runs). An answer for an error reported before the update is ignored, and an identical overlay is not redrawn.
- The server answers a repeated error with the overlay content again and only skips printing it to the terminal, so an error that survives an edit is shown again.
- Esc, × or a click outside closes it. `--no-overlay` or `"overlay": false` in `fast-serve/config.json` turns it off for compile and runtime errors; the terminal and browser console still get them. The overlay's footer names that option.

### Bundle load failures

- The readable message replaces `[object Object]` in the error boxes of the bundle's web parts for a minute after the failure, e.g. `[fast-serve] bundle "hello-world-web-part" could not be loaded: a module in it failed to compile; the page reloads after the fix. Details are in the fast-serve terminal.`
- After a load failure the page reloads on the first successful rebuild that follows a change, also a build with only warnings; because the dev server sends a build's warnings before its errors, that reload waits 100 ms and is cancelled when errors follow.
- A missing `config.json` external is named with its URL or path and the advice to check `config/config.json` and that SharePoint can reach it (the tenant CSP blocks most CDNs, as with heft).

## Implementation Notes

- The page runtime is a plain script prepended to the rendered `manifests.js` (wrapped so that a failure to start can never break manifest loading). It wraps `console.error`, listens to `error`, `unhandledrejection` and the `webpackErrors` / `webpackInvalid` / `webpackOk` / `webpackStillOk` window messages that every dev-server client posts, and draws the overlay in a shadow root.
- Reports are POSTed as `text/plain` to `https://localhost:<port>/fast-serve/browser-errors` (CORS); the answer carries the overlay content or the page message, so formatting and hints live in one place on the server.
- Source maps are read from the dev server's in-memory output (bundles and hot-update files) and parsed with Node's `SourceMap`; the cache is dropped on every compile.
- The dev server's own overlay is turned off.

## Edge Cases

- A runtime error inside a dependency without any project frame on the stack is not forwarded, even when project code triggered it asynchronously.
- A typo in a React hook name (`React.useState1`, `useState1` without an import, `import { useState1 } from 'react'`) is a runtime error, never a compile error: React comes in as an external, so Rspack can't check its exports, and the dev loop does not type-check.
- An overlay closes after any successful rebuild with new output, also when the edit didn't touch the failing code; the error comes back only when that code runs again.
- An external whose script fails to load prevents the bundle from running at all; only the page runtime sees it, so the reason is reported but nothing reloads automatically (fixing `config/config.json` needs a restart).

## Links

- [Dev server, debug manifests and debug URL](dev-server.md)
- [HMR and React Fast Refresh](hmr.md)
- [CLI, options and startup](cli-and-options.md)
- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: implementation behaviour, unit tests, integration test with a real dev server and a fake page with two bundles; live on SharePoint Online with spfx-rea and spfx-bench copies (2026-11-19): syntax error → one overlay (Rspack's overlay showed three), cleared after the fix; throw in an `onClick` and in a render → terminal `Second.tsx:12` / `:9` with code frame, printed once; syntax error at page load → readable error boxes and reload after the fix; missing external URL → named in terminal and error boxes; two bundles on one page → one overlay.
- Source (2026-11-20, `1.24.0-rspack.12`, live on a spfx-rea copy): runtime-error overlays from `React.useState1`, `useState1` and `import { useState1 }` stayed after the fix before the change; afterwards they close after the fix, re-open after an edit that keeps the error, close with state kept after an `onClick` error fix, and close after a fix whose build has one warning; dev-server client sends `webpackWarnings` without `webpackOk` for warnings-only builds (read from `@rspack/dev-server` 2.2.2).
- Confidence: high
- Last checked: 2026-11-20
