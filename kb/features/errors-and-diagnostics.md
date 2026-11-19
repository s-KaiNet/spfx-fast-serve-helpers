---
title: Errors and diagnostics
type: feature
status: current
tags:
  - project-kb
  - errors
  - overlay
  - terminal
  - debugging
  - troubleshooting
---

# Errors and diagnostics

## Summary

Errors from the developer's own code show in three places: the `fast-serve` terminal (source-mapped, with a code frame and a trimmed stack), Vite's error overlay over the SharePoint page, and the browser console. When a bundle can't load at all, the web part's error box shows a readable `[fast-serve]` message instead of SharePoint's `[object Object]`, and the page reloads by itself after the next file change. SharePoint's own errors and third-party noise are deliberately left in the browser console. Source maps let DevTools and VS Code debug the original `.ts`/`.tsx` files.

## Behavior

### What is shown where

| Error | Terminal | Overlay | Browser console | Web part error box |
|---|---|---|---|---|
| compile error during a hot update | yes | yes | yes | |
| compile error at page load, server unreachable, missing export | yes (server error) | | yes | yes, readable message |
| uncaught error / unhandled rejection from project code | yes, with code frame | yes | yes | |
| `console.error` from project code | yes, with code frame | no | yes | |
| SharePoint / third-party errors, rejections without a stack | no | no | yes | |

### Terminal forwarding rule

- Only errors whose stack has a frame in a project module (`https://localhost:<port>/src/...`, not `node_modules`) or in the `fast-serve` loader are forwarded. So `@pnp/telemetry-js` "Failed to fetch" and SharePoint's errors stay in the browser, and so does `Promise.reject('text')` (no stack).
- Frames are mapped through source maps to `src/...tsx:line:col`, the stack is trimmed after the last own frame, and a code frame is printed. Each error object is reported once; messages already printed by `fast-serve` or Vite are skipped.
- `console.error` goes to the terminal only: the code that logged it has handled it (React's "The above error occurred in the <X> component" is one of these).

### Error overlay

- Vite's overlay works over SharePoint pages and shows compile errors and uncaught runtime errors/rejections from project code: message, source location, code frame and trimmed stack.
- Esc or a click outside dismisses it; a hot update clears it; a newer error replaces it. A render error React reports several times (React 18 replays failed renders in development) is shown once.
- If the overlay is still open at the first edit after the page loaded (an error during the page load), the page reloads instead of hot-updating, as Vite does.
- The overlay's hint points at `fast-serve`'s own switch: `"overlay": false` in `fast-serve/config.json` or `--no-overlay` turns it off for compile and runtime errors; the terminal and console still get them.

### Bundle load failures

- When a bundle can't load (syntax or transform error at page load, unreachable server, missing export), the web part shows `[fast-serve] Failed to load bundle "<bundle>" …: <error> in src/…:line:col` (or a hint that a module failed to compile or the server is unreachable). A "does not provide an export named" error gets a hint: for a `config/config.json` external it names the external and says the loaded script doesn't define that property (see [SPFx library imports and config.json externals](library-imports-and-externals.md)); otherwise a `const enum` / type-only hint (see [TypeScript source compatibility](typescript-compatibility.md)).
- After a load failure the page waits for the next file change and reloads by itself; it backs off while the server is unreachable and pauses after 10 minutes until the tab is visible again.
- An SPFx library that fails to load is named with its component id and version; a tenant serving only older versions than the project uses gets the "`… older than … used by the project`" explanation.

### Startup and page-level messages

| Symptom | Meaning / fix |
|---|---|
| `No valid SPFx development certificate found` | run `npx heft trust-dev-cert` |
| "Error loading debug manifests" on the page | `fast-serve` isn't running, the browser doesn't trust the certificate (trust it, restart the browser), or Chrome/Edge's local network access prompt was denied |
| same error after stopping `fast-serve` | the debug query sticks to the tab (`sessionStorage`); open the page in a new tab without it |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` runs; stop it or use `--port` / `"port"` |
| `Unsupported SPFx version` | install the `spfx-fast-serve-helpers` version matching the project's SPFx |
| `No web parts, extensions or Adaptive Card Extensions found` | check `config/config.json` bundles (library components aren't served) |
| `serve configuration "x" not found … using "default"` | the `--config` name isn't in `serveConfigurations`; the warning lists the names |
| `ReferenceError` for a webpack `DefinePlugin` constant, or `Failed to resolve import` for a webpack alias | mirror the heft webpack customization in `fast-serve/vite.extend.mts` (see [Customizing the Vite config](vite-extend-file.md)) |
| `config/fast-serve.json is not read anymore` | move the file to `fast-serve/config.json` (same options) |
| `fast-serve/vite.extend.mts: "…" is ignored` or `a plugin from … overrides fast-serve` | remove the setting; use the `fast-serve` option the warning names |

The full list of fatal startup errors is in [CLI, options and startup](cli-and-options.md#startup-failures-exit-code-1).

### Debugging with source maps

- Every module is served from `https://localhost:<port>/<path in the project>` with an inline source map containing the original TypeScript, so DevTools lists files under `localhost:4321/src/...`.
- VS Code needs a `launch.json` (`msedge` or `chrome`, `launch` or `attach`) whose `url` is the printed debug page URL, with `pathMapping` and `sourceMapPathOverrides` mapping `https://localhost:4321/` to the workspace folder and `"outFiles": []` (so heft's webpack maps in `lib/`, `dist/`, `temp/` aren't scanned). `fast-serve` must already run; breakpoints bind when modules load, so reload to hit code that already ran. Old `webpack:///` overrides are unused. Step-by-step setup: [VS Code debugging and remote development](../operations/debugging-and-remote-development.md).

## Implementation Notes

- A browser-errors runtime, imported first by every bundle entry, reports errors over the HMR socket; the browser-errors component filters, source-maps and prints them, and sends uncaught errors back to the reporting page as a Vite error payload for the overlay. It replaces Vite's built-in console forwarding.
- The loader records the last server-side transform error and exposes it with a file revision at `/@spfx/status`; the bundle shim uses it to build the readable message and to know when to reload.
- The overlay hint is rewritten so it names `fast-serve/config.json` and `overlay` instead of a Vite config. See [Startup and request flows](../architecture/runtime-flows.md#failure-flow).

## Edge Cases

- The browser reports the position it has for a frame: for an undefined name inside JSX children Chrome can point at an earlier expression on the same line.
- An overlay error raised during page load turns the first edit into a reload.
- The VS Code `launch.json` has not yet been verified with F5 in real VS Code.

## Links

- [CLI, options and startup](cli-and-options.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [TypeScript source compatibility](typescript-compatibility.md)
- [SPFx library imports and config.json externals](library-imports-and-externals.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [Error reporting: project errors only, overlay for runtime errors](../decisions/error-reporting.md)
- [Known issues and fragile points](../limitations/known-issues.md)

## Evidence

- Source: user docs (errors, troubleshooting), VS Code debugging guide, HMR guide, project handoff notes, implementation behavior (browser-errors and loader components, bundle shim and library loader runtime); overlay and terminal forwarding verified live on 2026-11-18
- Confidence: high
- Last checked: 2026-11-19
