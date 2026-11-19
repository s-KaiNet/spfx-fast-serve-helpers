---
title: Acceptance run on the test projects
type: operation
status: current
tags:
  - project-kb
  - acceptance
  - live-verification
---

# Acceptance run on the test projects

## Summary

How the Rspack implementation is accepted: a fresh package tarball installed into copies of the two test projects (spfx-rea: web parts, four extension kinds and an ACE in five bundles; spfx-bench: 1000 generated modules, Fluent UI and PnP in two bundles), served on ports from 4430 up and checked live in a headless Chrome on SharePoint Online, one visible tab, pages only viewed. The last run (`1.24.0-rspack.10`) passed every check except the Field Customizer, which the test tenant never instantiates (with `heft start` too).

## Procedure

- Copy the projects (never the originals), pack the package, install the tarball into each copy, remove leftovers that change the build (an extend file from earlier experiments).
- Serve with `--port`, open the printed URL (or the hosted-workbench URL for the ACE, the `--config` URL for extensions), allow debug scripts, close tabs restored from the browser profile (a hidden tab delays Fast Refresh).
- Hot-update checks: set a marker on `window` (not a name SharePoint uses: SharePoint defines `window.__spfxMark` itself), put state into a component (click a counter), edit the file, poll the DOM; marker kept and state kept = hot update, marker gone = reload. Measure save → DOM with a `MutationObserver` that records the time of the change.
- Restore every edited file and stop every server and browser started.

## Last results (2026-11-20, `1.24.0-rspack.10`)

| Area | Check | Result |
|---|---|---|
| Web parts | HelloWorld + Second render on the page, theme tokens, 3 requests (`manifests.js`, bundle, image), no console errors | pass |
| HMR, web part | Second TSX edit ×3, counter state kept | pass, 127–138 ms |
| HMR, styles | HelloWorld `.module.scss` edit ×4, `<style>` count constant | pass, 133–258 ms |
| Reload | HelloWorld web part class edit | page reloaded with the new value |
| Application Customizer | Banner renders with the default configuration; TSX edit keeps its counter | pass, 170 ms |
| Command Set | `--config commands`: "Command Two" in the command bar, dialog opens; class edit reloads and the dialog shows the new text | pass |
| Form Customizer | `--config feedback_NewForm` renders on `SPListForm.aspx`; class-component edit ×2 hot-updates | pass, 139–253 ms |
| Field Customizer | `--config rating`: bundle loads, SharePoint never instantiates it | not verifiable (tenant; same with `heft start`) |
| ACE | hosted workbench: card renders with the bundled logo, property pane loads `chunk.Hello-property-pane.js`, card view edit reloads and the restored card shows the change | pass |
| Locale | `--locale de-de` with a `de-de` loc file: German string; loc edit reloads with the new string | pass |
| Overlay and terminal | syntax error → one overlay + `error in src/…` with code frame + `rebuilt … : 1 error`; fix closes it without reload | pass (both projects, also with two bundles on the page) |
| Browser errors | error thrown in a click handler → terminal `[Unhandled error]` mapped to `src/…:12` with code frame, runtime overlay | pass |
| Restarts and extend file | extend file added → restart; `DefinePlugin` value change → restart and the page reloads by itself with the new value; `devServer.headers` served with the CORS headers; broken edit → error, old server kept; file removed → restart | pass (0.1–0.2 s per restart) |
| spfx-bench | both web parts render, PnP data loaded ("Web: dev (30 lists)"), Fluent `Stack` and Sass `@use` tokens | pass |
| HMR across bundles | tree leaf TSX ×6 (178–240 ms), mid TSX ×6 (193–210 ms), SCSS ×3 (style count constant), PnP bundle TSX ×2 with loaded data kept (205–265 ms) | pass |
| Page load | spfx-bench F5 until both web parts rendered | 2.3–3.7 s (first F5 after a start is the slowest) |
| Persistent cache | cached starts live (spfx-rea 0.28 s ready, spfx-bench 0.62 s), HMR and error mapping after a cached start | pass |
| heft | `npm run build` (test, production bundle, package-solution) in both copies | pass |

## Links

- [Startup performance and the persistent cache](../features/performance-and-cache.md)
- [HMR and React Fast Refresh](../features/hmr.md)
- [Extensions and Adaptive Card Extensions](../features/extensions-and-aces.md)
- [Errors, overlay and terminal output](../features/errors-and-diagnostics.md)
- [Restarts on project changes](../features/project-restarts.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)

## Evidence

- Source: live run in headless Chrome against SharePoint Online on copies of both test projects, terminal logs of the servers
- Confidence: high
- Last checked: 2026-11-20
