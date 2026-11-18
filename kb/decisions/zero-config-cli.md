---
title: Zero-config CLI without a public Vite plugin API
type: decision
status: current
tags:
  - project-kb
  - decision
  - cli
  - configuration
  - vite
---

# Zero-config CLI without a public Vite plugin API

## Summary

The package is a single `fast-serve` command that builds the whole Vite configuration itself. There is no user `vite.config`, no exported plugin and no extension hook; the only public surface is the CLI and a small set of options with a fixed precedence. HTTPS with the SPFx development certificate is automatic, not an option.

## Context

The early proof of concept was a Vite plugin used from a project's own `vite.config`. The classic spfx-fast-serve offered an escape hatch (`webpack.extend.js`). A public plugin API would let users mix arbitrary Vite configuration with the SPFx-specific behavior (manifests, bundle shims, library facades, pre-bundling plugins), which depends on many exact Vite settings (`appType: 'custom'`, `server.origin`, `optimizeDeps.entries`, watch ignores, HMR overlay).

## Decision

- Ship a **zero-config CLI** (`fast-serve`) that runs Vite programmatically. The package's `exports` exposes only `./package.json`: no importable API.
- Options: `port`, `pageUrl` (with `{tenantDomain}` from `SPFX_SERVE_TENANT_DOMAIN`), `locale`, `serveConfiguration` (`--config` / `--serve-config`) and `overlay` (`--no-overlay`). Precedence: CLI flags > `config/fast-serve.json` > `config/serve.json` > defaults (port `4321`, locale `en-us`).
- HTTPS is always on with the SPFx development certificate (managed through `@rushstack/debug-certificate-manager`); the server listens on `localhost`.
- Vite and `@vitejs/plugin-react` are regular dependencies of the package, so a project adds only `spfx-fast-serve-helpers` and a `"serve": "fast-serve"` script.

## Rationale

- Zero setup matches how SPFx developers already work (`npm run serve`), and keeps migration from `heft start` to one install and one script.
- Owning the full Vite configuration keeps the SPFx contract intact: settings the loader, facades and HMR rely on cannot be overridden by accident.
- A small option set is easy to document and to keep compatible across SPFx minors; the version-locked package can change internals freely because nothing internal is public.

## Consequences

- Users cannot add Vite plugins, aliases or custom server middleware; anything a project needs must be supported by the package itself.
- Old classic-fast-serve settings map to the new options or are dropped (`openUrl` → `pageUrl`, `config` → `--config`, `fullScreenErrors` → `overlay`; `webpack.extend.js` has no equivalent).
- The ready banner prints the page URL with the debug query; the browser is not opened automatically.

## Links

- [CLI, options and startup](../features/cli-and-options.md)
- [Architecture overview](../architecture/overview.md)
- [Dev server only; Heft keeps builds, checks and packaging](dev-server-only.md)
- [Match heft behavior for serve configurations and the debug URL](match-heft-serve-behavior.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, package manifest, user docs
- Confidence: stated
- Last checked: 2026-11-18
