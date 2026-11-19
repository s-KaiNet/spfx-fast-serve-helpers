---
title: "Error reporting: project errors only, overlay for runtime errors"
type: decision
status: current
tags:
  - project-kb
  - decision
  - errors
  - overlay
  - terminal
---

# Error reporting: project errors only, overlay for runtime errors

## Summary

Browser errors reach the `fast-serve` terminal only when their stack has a frame in project code or the `fast-serve` loader. Vite's error overlay is kept over the SharePoint page and also shows uncaught runtime errors and unhandled rejections from project code, but not `console.error`. The overlay can be turned off with the `overlay` option.

## Context

Vite 8 can forward everything the page logs to the terminal (`server.forwardConsole`). On a SharePoint page that is mostly SharePoint's own errors and third-party noise (for example `@pnp/telemetry-js` "Failed to fetch"), which buries the developer's errors. Vite's overlay natively shows only compile errors. The classic spfx-fast-serve had a `fullScreenErrors` setting.

## Decision

- Replace Vite's console forwarding with an own browser-errors channel: uncaught errors, unhandled rejections and `console.error` calls are sent over the HMR socket, and the server prints one only when a stack frame is a project module (`https://localhost:<port>/src/...`, not `node_modules`) or the loader. Frames are source-mapped, the stack is trimmed after the last own frame, and a code frame is printed.
- **Overlay for uncaught errors and rejections from project code**, in addition to compile errors; the same error is shown once (React's replayed render errors).
- **Not for `console.error`**: it goes to the terminal only.
- **Opt-out**: `"overlay": false` in `fast-serve/config.json` or `--no-overlay` turns the overlay off for compile and runtime errors; the overlay's hint names this option instead of a Vite config.
- Bundle load failures show a readable `[fast-serve]` message in the web part's error box instead of SharePoint's `[object Object]`, and the page reloads after the next file change.

## Rationale

- A stack-frame rule is objective and needs no per-library deny list: if no own frame is involved, the developer cannot fix it.
- The overlay works over SharePoint pages and puts the error where the developer is looking; runtime errors are what break a web part most often.
- Code that logs with `console.error` has handled the error (React's "The above error occurred…" message is one), so an overlay would be noise.
- Some developers prefer the console; a single option covers that without logging levels.

## Consequences

- Rejections without a stack (`Promise.reject('text')`) and SharePoint's own errors stay in the browser console only.
- An overlay open during page load turns the first edit into a full reload (Vite's rule).
- The overlay hint depends on the text of Vite's client, which must be re-checked on Vite upgrades.

## Links

- [Errors and diagnostics](../features/errors-and-diagnostics.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [CLI, options and startup](../features/cli-and-options.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, user docs (errors), implementation behavior (browser-errors component); verified live on the tenant on 2026-11-18
- Confidence: stated
- Last checked: 2026-11-18
