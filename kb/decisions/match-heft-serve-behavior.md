---
title: Match heft behavior for serve configurations and the debug URL
type: decision
status: current
tags:
  - project-kb
  - decision
  - extensions
  - serve-configurations
  - heft
---

# Match heft behavior for serve configurations and the debug URL

## Summary

Where `heft start` has observable behavior a user relies on, `fast-serve` copies it, including its quirks: unknown serve configuration names fall back to `default`, the page is chosen in heft's order, the debug query replaces the page's own query, and extension configurations omit `debug=true`. The `pageUrl` option sits where heft's fallback pages are.

## Context

Users switch between `heft start` and `fast-serve` in the same project and the same `config/serve.json`. The generator writes `serveConfigurations` for every extension (Application Customizer, ListView Command Set, Field and Form Customizer). Any divergence would make the same configuration behave differently in the two tools.

## Decision

- `--config` / `--serve-config` select a `serveConfigurations` entry; an unknown name **warns with the available names and falls back to `default`**, like heft.
- Page order: the named configuration's `pageUrl` (other than `default`) > the `pageUrl` option (`--page-url`, then `config/fast-serve.json`) > `serveConfigurations.default.pageUrl` > `initialPage`.
- The debug parameters **replace the page URL's own query**; a `#hash` is kept.
- Extension configurations become `loadSPFX=true` plus `customActions` / `fieldCustomizers` JSON or the form customizer parameters, **without `debug=true`** (list pages fail to load debug scripts with both), as heft does.
- Relative `./` icon paths are served from `src`; paths without `./` pass through as in heft.
- The configuration is read at start; mismatches with the project (unknown ids, wrong extension kind, generator placeholders) are warnings, not errors.

## Rationale

- One `serve.json`, two tools, the same result: no surprises when moving between `heft start` and `fast-serve`, and existing heft knowledge and docs apply.
- Heft's quirks encode SharePoint constraints (for example the `debug=true` conflict on list pages), so diverging would break real pages.

## Consequences

- `--config commands` opens its own list page even when `config/fast-serve.json` sets a `pageUrl`.
- A typo in `--config` does not stop the server; the warning must be noticed.
- Editing `serve.json` requires a restart to get the new URL.
- Heft's own bugs are not copied (for example heft 1.24.1 writes port 4321 into `manifests.js` regardless of `serve.json`).

## Links

- [Serving web parts, extensions and ACEs](../features/serving-components.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Zero-config CLI without a public Vite plugin API](zero-config-cli.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, extensions research, user docs, implementation behavior (configuration and debug URL components)
- Confidence: stated
- Last checked: 2026-11-18
