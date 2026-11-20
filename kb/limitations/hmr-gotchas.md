---
title: HMR gotchas
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - hmr
  - react-fast-refresh
  - ace
---

# HMR gotchas

## Summary

HMR with React Fast Refresh only updates in place what an HMR boundary accepts. Several common SPFx code shapes make edits fall back to a full page reload or re-run code that should run once: mixed exports in component files, services imported by the component class, module-level side effects, setup outside `onInit`, and every ACE edit. These are consequences of how Vite and Fast Refresh work and of SharePoint owning component instances, not bugs.

## Current Knowledge

| Gotcha | Cause | Effect | Workaround |
|---|---|---|---|
| Mixed exports | Fast Refresh skips files that export components **and** runtime values (constants, hooks, helpers); type-only exports are fine | the update bubbles up to the component class → full reload on every edit of that file | keep component files component-only; move hooks, constants and helpers to their own files |
| Services/helpers imported only by the component class | the web part/extension/ACE class was instantiated by SharePoint and can't be swapped; the bundle entry reloads the page for updates that reach it | edits reload the page | import shared logic from component files where hot updates are wanted, or accept the reload |
| Module-level side effects | an updated module re-runs top to bottom | `initializeIcons()` warns about re-registration, `spfi()` singletons are recreated, listeners and timers are added twice, a React root rendered from module level renders a second copy | do setup in `onInit`, keep roots in instance fields, pass results down via props or context |
| Module-level state | module re-evaluation resets `let cache = …` | state lost on update | keep state in components or `onInit` results |
| Stale UI after a successful update | data came from an `onInit` result or a singleton that didn't re-run | change not visible | reload the page |
| ACE edits | card and quick views are classes registered in `onInit` and imported only by the ACE class; there is no React tree | every ACE edit (views, quick view JSON templates, loc strings, ACE and property pane classes) reloads the page; an open quick view closes | none; re-open the quick view (read mode) |
| Class components | Fast Refresh re-mounts class components | state lost (for example the Form Customizer template's class-based form loses unsaved input) | use named function components |
| Hook order change | Fast Refresh resets on purpose | component re-mounts | — |
| Overlay open at the first edit | Vite's rule when an error overlay was opened during page load | first edit is a full reload instead of a hot update | none needed |
| Manifests, `serve.json`, `config.json`, `package.json`, tsconfig | read at page load or into the project model | full reload (tsconfig transform options restart the server; `config/sass.json` and `fast-serve/vite.extend.*` edits always restart it); a changed serve configuration changes the printed URL only after a restart | restart `fast-serve` after editing `serve.json` |
| Site theme switch | theme tokens resolve once per style insert or hot update; no theme watching | colors don't follow a theme change | reload the page |
| First use of a new dependency | Vite pre-bundles it | one full reload | — |

Severity: low individually, but mixed exports and module-level setup are the most common reasons a project "doesn't hot-update"; they are the core of the HMR guidance given to users.

## Links

- [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)
- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Serving web parts, extensions and ACEs](../features/serving-components.md)
- [Scope cuts and features dropped on purpose](../decisions/scope-cuts.md)
- [Dev vs production differences](dev-vs-production.md)

## Evidence

- Source: user HMR guide, project handoff notes (gotchas), live acceptance on the test tenant (web parts, customizers, ACE)
- Confidence: high
- Last checked: 2026-11-19
