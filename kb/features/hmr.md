---
title: HMR and React Fast Refresh
type: feature
status: current
tags:
  - project-kb
  - hmr
  - fast-refresh
  - dev-server
---

# HMR and React Fast Refresh

## Summary

Edits are applied inside the AMD bundles SharePoint loaded, without a page reload where possible. React components keep their state (React Fast Refresh through `@rspack/plugin-react-refresh` and SWC's `react.refresh` transform), CSS-module edits apply without a reload, and an edit that reaches the bundle entry (web part, extension or ACE class) reloads the page. Several bundles on one page all hot-update: the bundles share one compilation, and a small runtime addition fans each hot-update chunk out to every bundle's runtime. Measured live: about 120–160 ms from save to DOM on spfx-rea and 170–240 ms on spfx-bench (1000 modules, two bundles).

## Behavior

### What happens on an edit

| Edit | Result |
|---|---|
| `.tsx`/`.ts` module whose exports are all React components | hot update; Fast Refresh re-renders, state kept |
| `.module.scss` / `.scss` / `.css` imported by such a component | the style module and the component re-run; new styles applied without a reload |
| module that also exports non-components (hooks, constants), services, anything that only the component class imports | the update bubbles to the bundle entry → full page reload |
| web part / extension / ACE class, multi-component bundle entry | full page reload |
| loc file used only by components / loc file the class imports | hot update / full page reload (see [Localized strings](localization.md)) |
| edit that adds or removes a library or `config.json` external import of a bundle, edit of a local-file external | full page reload sent by fast-serve (the AMD `define` list is fixed at load; see [SPFx libraries and config.json externals](libraries-and-externals.md)) |
| any edit in a bundle that is on the page together with other fast-serve bundles | same rules, per bundle |

The reload comes from the dev server's HMR client when an update is not accepted on the way to the entry (Rspack's "cannot apply update" path); it is not a separate fast-serve mechanism.

### Pieces

- **Dev server:** `hot` and `liveReload` on; the client and the HMR client are added to every bundle and connect to `wss://localhost:<port>/ws` (see [dev server](dev-server.md)). Hot-update manifests and chunks (`*.hot-update.json`, `*.hot-update.js`) are served with `Cache-Control: no-store`.
- **SWC:** `jsc.transform.react.refresh` on (classic runtime, development transform) for project TypeScript.
- **Refresh loader and runtime:** `@rspack/plugin-react-refresh` with its loader restricted to the project's `src` folder and the `src` folders of [linked library projects](local-library-projects.md). Its own injected entry is replaced by fast-serve's refresh entry, added as a global entry so it runs first in every bundle: it injects the refresh runtime into React's global DevTools hook for that bundle and installs no-op `$RefreshReg$`/`$RefreshSig$` fallbacks. The plugin's own entry guards injection with a window flag named after `output.uniqueName`; with several bundles sharing that name only the first bundle would inject, and Fast Refresh in the others would silently do nothing, because each bundle has its own React and its own refresh runtime.
- **Development React from the project:** `react`, `react-dom`, `react-dom/client`, `react/jsx-runtime`, `react/jsx-dev-runtime` are aliased to the project's copies, so nested copies (PnP's React 17) collapse and hooks work (see [Rspack compile](rspack-compile.md)).
- **Several bundles on one page:** see [one compilation for several bundles](../decisions/several-bundles-one-compilation.md). Every bundle's runtime installs its hot-update handler on the same global; a few lines appended to Rspack's chunk-loading runtime module keep a list of the handlers and replace the global with a function that calls all of them. Rspack's handler ignores chunk ids it is not waiting for, so each update reaches the runtime that requested it, also for an async chunk shared by two bundles.
- **Styles:** `@microsoft/sp-css-loader` inserts styles through `@microsoft/load-themed-styles`. A small loader after it routes that call through fast-serve's hot-styles runtime. The first evaluation of a style module keeps load-themed-styles' batched insertion (one `<style>` for everything evaluated in the same tick, like heft). A re-evaluation by a hot update inserts its styles synchronously as its own element, captures it from load-themed-styles' `styleinsert` event and removes it (and its theme-state record) when the next update disposes the module. Elements no longer pile up: after any number of edits a module has at most its original batched rules (inert, because SPFx class names change with the content) plus one current element. If the page configured load-themed-styles to insert styles elsewhere, nothing is captured and nothing is removed.
- **Browser console:** client logging is `warn`, so connecting and applying updates log nothing; only warnings before a reload and errors appear.

### Measured (live, SharePoint Online, headless Chrome, visible tab)

| Project | Edit | Save → DOM (runs) | Rebuild |
|---|---|---|---|
| spfx-rea | Second web part TSX (counter state kept 3/3) | 117–163 ms (11 runs) | 37–47 ms |
| spfx-rea | HelloWorld TSX | 130–150 ms (4) | ~40 ms |
| spfx-rea | HelloWorld `.module.scss` | 119–174 ms (8) | ~40 ms |
| spfx-rea | web part class | full reload | 70–100 ms |
| spfx-bench | leaf TSX in the tree bundle | 156–225 ms (7) | 80–180 ms |
| spfx-bench | mid TSX (57 descendants) | 173–220 ms (4) | 80–180 ms |
| spfx-bench | `.module.scss` in the tree bundle | 173–229 ms (7) | 80–180 ms |
| spfx-bench | PnP bundle TSX (loaded data kept) | 180–284 ms (7) | 80–180 ms |

Server RSS: spfx-rea 0.25 GB ready, 0.29–0.30 GB after the edits; spfx-bench 0.55–0.60 GB during the edits. F5 on spfx-bench until both web parts rendered: 2.6–2.8 s (batched style insertion kept for that reason: inserting every module's styles as its own element cost 0.2–0.4 s per load).

## Constraints

- A background or hidden tab throttles timers to once per second; Fast Refresh schedules its re-render with a timer, so hot updates in a hidden tab appear up to a second late (or when the tab becomes visible).
- With several bundles on a page every bundle has its own websocket client; fast-serve's page runtime still shows a single compile-error overlay ([Errors, overlay and terminal output](errors-and-diagnostics.md)).
- HMR-boundary rules are React Refresh's: a file that mixes component and non-component exports reloads the page.

## Links

- [Acceptance run on the test projects](../operations/acceptance-run.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [Rspack compile](rspack-compile.md)
- [One compilation for several bundles](../decisions/several-bundles-one-compilation.md)
- [Rspack facts and references](../references/rspack.md)
- [Architecture overview](../architecture/overview.md)

## Evidence

- Source: implementation behaviour; integration test with a real dev server on a fixture project with two bundles, both evaluated in one fake page (fake RequireJS `define`, script loading, `fetch`, real websocket): component edits in each bundle apply without a reload, a style edit replaces its element without piling up, hot-update files carry `no-store`, a web part class edit reloads, nothing is logged to the console; the same test fails for the first bundle without the fan-out; live checks on copies of spfx-rea and spfx-bench from the packed tarball (counter state kept, theme-token styles, style-element counts unchanged across edits, PnP bundle state kept, class edit reload)
- Confidence: high
- Last checked: 2026-11-19
