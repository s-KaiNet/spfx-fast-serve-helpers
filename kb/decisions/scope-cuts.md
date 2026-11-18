---
title: Scope cuts and features dropped on purpose
type: decision
status: needs-clarification
tags:
  - project-kb
  - decision
  - scope
  - theming
  - styles
  - localization
---

# Scope cuts and features dropped on purpose

## Summary

Several items from the original parity list were cut by the user rather than left open: theme-change monitoring, `config/sass.json` settings in Vite's own Sass compile, a further locale switch, and handling of the already-hashed CSS in `@pnp/spfx-property-controls` 3.13. Each has a cheap workaround or affects few projects, so it was not worth the complexity.

## Context

The serve plan listed everything `heft start` and the classic spfx-fast-serve do. After the core and P1 work, the remaining small items were reviewed one by one; the ones below were cut. Deferred work (library components, SPFx 1.23, tunnels, containers, re-mount instead of reload) is a different category: planned for later, not cut.

## Decision

| Item | Decision | Why it is acceptable |
|---|---|---|
| Theme-change monitoring | No watching: theme tokens resolve once per style insert or hot update. The proof of concept polled the theme every 500 ms; that was removed, and a hook on the page's theme state was cut too | Switching the site theme while developing is rare; a page reload recolors everything. Polling cost CPU on every page for an edge case |
| `config/sass.json` in Vite's Sass compile | Vite's Sass compile does not read the rig's `config/sass.json` (for example `silenceDeprecations`); only the typings generation uses it | Dev compile is at most more permissive or noisier; `heft build` with the real settings stays the gate |
| Locale switch | Only the `locale` option (`--locale`, `config/fast-serve.json`) with per-resource fallback to `en-us`; no further switching mechanism | Changing the locale is a restart with another flag |
| `@pnp/spfx-property-controls` 3.13 CSS | Not handled. That version ships JavaScript with hard-coded hashed class names that `require` a `.module.css`, which a CSS-module pipeline renames again | Probably broken under heft 1.24 as well (inferred), so dev would not differ from production; one library version with a unique shape |

## Rationale

- Each item adds code paths that must track Vite and SPFx changes, for little user benefit.
- Production correctness is unaffected in every case because Heft builds the package.

## Consequences

- Users must reload after changing the site theme to see token colors update.
- Sass deprecation warnings silenced in `config/sass.json` may still appear in the dev terminal.
- Projects on `@pnp/spfx-property-controls` 3.13 may see unstyled property controls in dev.
- An item can be revived only by a new user decision.

## Needs Clarification

- What exactly "locale switch" covered when it was cut (an `SPFX_LOCALE` environment variable, switching the locale without a restart, or both)?

## Links

- [Styles, theme tokens and asset typings](../features/styles-and-assets.md)
- [Localized strings](../features/localization.md)
- [Styles, localization and assets in SPFx](../concepts/styles-localization-assets.md)
- [Dev server only; Heft keeps builds, checks and packaging](dev-server-only.md)

## Evidence

- Source: user decisions recorded in the project handoff notes and the earlier priority lists, library CSS research (property-controls 3.13)
- Confidence: stated (cuts), uncertain (exact scope of the locale switch)
- Last checked: 2026-11-18
