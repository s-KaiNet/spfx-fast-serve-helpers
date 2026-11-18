---
title: Known issues and fragile points
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - open-issues
  - errors
  - overlay
  - extensions
---

# Known issues and fragile points

## Summary

Open problems that are not design limits: a Field Customizer that the test tenant never instantiates (with `heft start` too), an occasional page-load hang seen before the error-forwarding rework (skipped; HTTP/1.1 is the likely fix if it returns), gaps in terminal error forwarding, an overlay hint that depends on the text of Vite's client, and an unverified VS Code F5 setup. Each entry states the cause, status and what to do.

## Current Knowledge

### Field Customizer not instantiated on the test tenant (status: open, tenant issue)

- SharePoint loads the Field Customizer module but never calls `onInit`/`onRenderCell`; `heft start` behaves the same on that tenant, so it is attributed to the tenant or list experience, not to `fast-serve`.
- Consequence: Fast Refresh of cell components is unverified live; Application Customizer, Command Set and Form Customizer were verified.

### Occasional page-load hang (status: skipped)

- Reproduced 8 of 64 loads only in an earlier build, before browser error forwarding was restricted to project errors; a later 32-load acceptance run had no hangs.
- Finding: a stall inside Chrome on the HTTP/2 connection — the server sent `react-dom` within ~100 ms, Chrome never received the headers.
- Vite 8 always serves HTTP/2 when HTTPS is on. If the hang returns, serving HTTP/1.1 is the likely fix (resume notes in [Deferred work](../roadmap/deferred-work.md)). Severity: low (not reproduced), high if it returns (page never finishes loading; reload helps).

### Terminal error forwarding gaps (status: by design)

- Only errors whose stack has a project frame (`https://localhost:<port>/src/...`) or a loader frame are forwarded. Rejections without a stack (`Promise.reject('text')`) and errors whose stack has no project frame (thrown and caught only inside dependencies) stay in the browser console only, as do SharePoint and third-party errors.
- `console.error` from project code goes to the terminal but never opens the overlay.
- The browser reports the position it has for a frame: for an undefined name in JSX children Chrome can point at an earlier expression on the same line.
- React 18 replays a failed render 2–3 times; a signature filter shows it once.

### Overlay footer hint depends on Vite's client text (status: fragile)

- The overlay's hint is redirected to the `overlay` option of `config/fast-serve.json` by rewriting two text tokens of Vite's client. A Vite upgrade that changes that text silently drops the hint (the overlay still works); a unit test checks the tokens exist in the installed Vite. Recheck when bumping Vite.

### Other fragile dependencies

- `@microsoft/sp-lodash-subset` ships an AMD blob in its ESM folder; its export names are read by evaluating it.
- Oxc's automatic tsconfig lookup must stay off (the SPFx rig's `importsNotUsedAsValues: "remove"` would keep type-only imports).
- Plugins used in pre-bundling need hook filters, or pre-bundling gets about twice as slow.

### VS Code F5 (status: open)

- The documented `launch.json` (Edge/Chrome, path mapping from `https://localhost:4321/` to the workspace) is not yet verified with F5 in real VS Code; DevTools source maps work (setup in [VS Code debugging and remote development](../operations/debugging-and-remote-development.md)).

## Links

- [Errors and diagnostics](../features/errors-and-diagnostics.md)
- [Error reporting: project errors only, overlay for runtime errors](../decisions/error-reporting.md)
- [Serving web parts, extensions and ACEs](../features/serving-components.md)
- [Environment and browser gotchas](environment-and-browser-gotchas.md)
- [Dev vs production differences](dev-vs-production.md)

## Evidence

- Source: project handoff notes (open issues, gotchas, page-load hang findings), user docs (errors), implementation behavior (browser-errors component), live checks on the test tenant
- Confidence: high; the HTTP/1.1 fix is an untested hypothesis (uncertain)
- Last checked: 2026-11-18
