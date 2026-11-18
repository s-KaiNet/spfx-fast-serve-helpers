---
title: Deferred work
type: roadmap
status: current
tags:
  - project-kb
  - roadmap
  - hmr
  - remote-development
  - teams
---

# Deferred work

## Summary

Items that were skipped or put on the "later, not planned now" list: the occasional page-load hang (skipped, with notes on how to resume), tunnels (ngrok), Docker/WSL/containers, Teams and other Microsoft 365 hosts, and re-mounting web parts instead of reloading the page. None is scheduled; each needs the user's go-ahead. Library components and SPFx 1.23 are also "later" but researched, with their own pages.

## Current Knowledge

### Occasional page-load hang (skipped)

- Seen in 8 of 64 loads only in a build before browser error forwarding was restricted to project errors; a later 32-load acceptance run on the large benchmark project had no hangs.
- Finding: a stall inside Chrome on the HTTP/2 connection; the server sent `react-dom` within ~100 ms but Chrome never received the headers.
- How to resume if it returns: reproduce with repeated cold loads on the large benchmark project (see [Benchmark method](../operations/benchmark-method.md)), capture network timing for the stuck request, then try serving HTTP/1.1. Vite 8 always uses HTTP/2 when HTTPS is on, so this means overriding the server's HTTP version. The HTTP/1.1 fix is a hypothesis, not tested.

### Tunnels (ngrok) and mobile testing (later)

- Today `fast-serve` is `localhost` only (SharePoint's CSP allows `localhost:*`, and sp-loader accepts only a `localhost` debug manifest URL).
- The classic tool had an ngrok plugin. A Vite version would use the tunnel host as the server origin, route HMR through the tunnel and allow that host.

### Docker, WSL and containers (later)

- The classic `containers` option has no equivalent (`not supported yet` in the migration table).
- A Vite version would need binding to `0.0.0.0`, file-watch polling, a fixed HMR client port/wss URL, and probably auto-detection like the classic tool. Until then, remote setups work only by forwarding the port so the browser still reaches `https://localhost:<port>` (see [Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)).

### Teams and other Microsoft 365 hosts (later)

- Teams tabs, personal apps, Office and Outlook hosts run the same web part; debugging there needs the host's app URL with the debug query (the classic tool documented this for Teams). Planned as docs plus a URL builder.
- Related security note: the dev server reflects any origin in CORS (plus the Private Network header), so any website open in the browser can read the served source while `fast-serve` runs. An early plan suggested restricting origins to SharePoint, Teams, Office and Outlook hosts; a configurable allowed-origins option was later rejected (see [Dev server only](../decisions/dev-server-only.md)), and a fixed host list is not decided.

### Re-mount web parts instead of reloading the page (later, idea only)

- Problem: when an update reaches a module nothing can accept, the page reloads (2.5–6 s). Typical causes: the web part class was edited, a service also imported by the class was edited, a file mixes component and other exports, or a module creates state when loaded (see [HMR gotchas](../limitations/hmr-gotchas.md)).
- Idea: when an update reaches the generated entry, re-mount live web part instances instead of reloading. In dev the entry exports a thin subclass that records instances; when the class changed, copy the new prototype methods onto the old class (instances keep `context`, `properties`, `domElement`); then call `onDispose()` and `render()` per instance. A simpler first step: if the class didn't change (shared-service case), only call `render()` again. Uses only public SPFx methods.
- Limits (fall back to a reload): `onInit` changed; changed field initialisers don't reach existing instances; React state is lost (re-mount, not Fast Refresh); an open property pane keeps the old configuration until reopened; module-level state is recreated.
- Before building: a live check that `onDispose()` then `render()` behaves well in SharePoint, including the property pane, theme changes and several instances on a page. The user decided it is not for v1.

## Links

- [Roadmap overview](overview.md)
- [Known issues and fragile points](../limitations/known-issues.md)
- [Unsupported scope](../limitations/unsupported-scope.md)
- [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [VS Code debugging and remote development](../operations/debugging-and-remote-development.md)

## Evidence

- Source: project handoff notes (open issues, "Later" list), Vite serve plan research (feature gap table, re-mount idea), migration notes, user docs (limitations)
- Confidence: stated for status; designs are unbuilt ideas (uncertain until tried)
- Last checked: 2026-11-18
