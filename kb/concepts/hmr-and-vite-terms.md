---
title: HMR, Fast Refresh and Vite terms
type: concept
status: current
tags:
  - project-kb
  - vite
  - hmr
  - react-fast-refresh
---

# HMR, Fast Refresh and Vite terms

## Summary

`fast-serve` is a Vite dev server, so edits travel as hot module replacement (HMR) updates through an ES module graph. React Fast Refresh swaps React components in place with state kept; anything that no module accepts ends in a full page reload. This page defines those mechanisms and the Vite vocabulary (pre-bundling, warmup, overlay, module graph) the rest of the KB uses.

## Current Knowledge

### Update kinds

| Kind | What happens | Typical trigger |
|---|---|---|
| CSS hot swap | the `<style>` content is replaced, nothing re-renders | `.module.scss`, `.scss`, `.css` edits |
| HMR + Fast Refresh | the changed module and its importers up to the nearest accepting module re-run; React re-renders and keeps `useState`/`useReducer` state and refs | function components in `.tsx` files that export only components; plain modules imported by them |
| Full reload | the whole SharePoint page reloads | an update no module accepts, config/manifest changes, first use of a new dependency |

### HMR boundaries

- A **boundary** is a module that accepts its own updates. With Fast Refresh, a file is a boundary only if all its runtime exports are React components; type-only exports are fine.
- An update **bubbles** up the importers until it reaches a boundary. If it reaches the component class (web part, extension, ACE class), the page reloads: SharePoint created that instance, so it cannot be swapped.
- Consequences:
  - Files that export components *and* other values (constants, hooks, helpers) are skipped by Fast Refresh, so their edits reload the page.
  - Services and helpers imported only by the component class also reload the page.
  - ACE card and quick views are classes registered in `onInit` and imported only by the ACE class, so every ACE edit reloads.
- Module-level side effects (`initializeIcons()`, PnPjs singletons, listeners, timers) re-run on every hot update of their module, and module-level state is reset. Setup belongs in `onInit`.
- Fast Refresh needs named function components; class components re-mount (state lost), and changing hook order resets state.
- In dev all bundles share one module graph, so a module imported by two bundles is one instance; in production each bundle has its own copy.

### Vite terms used in this project

- **Native ESM dev serving**: Vite transforms each requested file on demand (TypeScript and JSX via Oxc) and the browser loads it as an ES module. A page loads hundreds or thousands of modules from localhost, so cold page loads of large projects are slower than heft while edits are much faster.
- **Module graph**: Vite's server-side record of modules and their imports; it drives HMR propagation and source maps.
- **Dependency pre-bundling / optimizer** (`optimizeDeps`): Vite bundles third-party dependencies from `node_modules` into a few ES modules with Rolldown at start, converting CommonJS to ESM. A dependency used for the first time after start is optimized on the fly and causes one page reload. `optimizeDeps.entries` tells the scanner where to start, since there is no `index.html`.
- **Warmup**: transforming modules before the browser asks for them. `fast-serve` does not use Vite's `server.warmup`; it warms the import graph of the bundle entries after the first pre-bundling run, so pre-bundling is not delayed and unused files are not transformed.
- **Error overlay**: Vite's in-page panel for errors (`server.hmr.overlay`). It works over SharePoint pages; `fast-serve` shows compile errors and uncaught runtime errors from project code in it, and the `overlay` option (`--no-overlay`) turns it off. If the overlay is open at the first edit after a page load, Vite reloads instead of hot-updating.
- **HMR client**: Vite's browser client connects over a WebSocket; `[vite] connected.` in the console means hot updates can arrive.
- **`server.origin`**: makes asset URLs absolute, needed because the page origin is SharePoint, not the dev server. `appType: 'custom'` because Vite serves no HTML page.
- **`experimental.bundledDev`**: Vite's bundled dev mode; not used.

## Links

- [SPFx development loop and what fast-serve replaces](spfx-dev-loop.md)
- [SPFx component types](spfx-component-types.md)
- [Styles, localization and assets in SPFx](styles-localization-assets.md)
- [Glossary](glossary.md)

## Evidence

- Source: project docs (HMR guide), research (live HMR checks on SharePoint pages), implementation behavior
- Confidence: high
- Last checked: 2026-11-18
