---
title: Zero-config CLI with an optional Vite extend file
type: decision
status: current
tags:
  - project-kb
  - decision
  - cli
  - configuration
  - vite
  - webpack-customization
---

# Zero-config CLI with an optional Vite extend file

## Summary

The package is a single `fast-serve` command that builds the whole Vite configuration itself; zero config is the default and the normal case. The only escape hatch is the optional `fast-serve/vite.extend.mts`, a plain Vite config that `fast-serve` merges under its own settings, documented as the development counterpart of a heft webpack customization and tied to the Vite major the package ships. `fast-serve` never runs or translates heft webpack customizations. HTTPS with the SPFx development certificate is automatic, not an option.

## Context

The early proof of concept was a Vite plugin used from a project's own `vite.config`. The classic spfx-fast-serve offered an escape hatch (`fast-serve/webpack.extend.js`) that projects used to repeat the dev-relevant parts of their gulp webpack customization. The SPFx-specific behavior (manifests, bundle shims, library facades, pre-bundling plugins) depends on many exact Vite settings (`appType: 'custom'`, `server.origin`, `optimizeDeps.entries`, watch ignores, HMR overlay), so arbitrary user configuration is risky.

Heft projects can customize webpack through `config/spfx-customize-webpack.js` or `config/webpack-patch.json` patch files. Without a counterpart, such projects could not run under `fast-serve`: `DefinePlugin` constants were `ReferenceError`s, aliases didn't resolve, loaders for extra file types were missing.

## Decision

- Ship a **zero-config CLI** (`fast-serve`) that runs Vite programmatically. There is no user `vite.config` and no fast-serve Vite plugin export.
- Options: `port`, `pageUrl` (with `{tenantDomain}` from `SPFX_SERVE_TENANT_DOMAIN`), `locale`, `serveConfiguration` (`--config` / `--serve-config`) and `overlay` (`--no-overlay`). Precedence: CLI flags > `fast-serve/config.json` > SPFx defaults from `config/serve.json` > built-in defaults (port `4321`, locale `en-us`). All `fast-serve` files of a project live in its `fast-serve/` folder, as in the classic spfx-fast-serve; the old location `config/fast-serve.json` (early betas) is not read; a warning asks to move it.
- **Escape hatch:** an optional `fast-serve/vite.extend.mts` (also `.ts`, `.mjs`, `.js`, `.cjs`) with a Vite config object or `defineConfig((context, env) => …)`. `fast-serve`'s own settings win over it; protected settings only produce warnings. Behavior: [Customizing the Vite config](../features/vite-extend-file.md).
- **Public package surface stays minimal:** the CLI, plus the package entry exporting `defineConfig` and types (`FastServeConfig`, `FastServeContext`, and Vite's `UserConfig`, `Plugin`, `ConfigEnv`). Internal plugin names, virtual modules and pre-bundling contents stay private.
- **Webpack customizations are never run or translated.** A static startup hint points to the extend file when a heft customization exists and no extend file does. An agent skill shipped in the npm package explains the webpack → Vite mapping; there is no install command for it.
- HTTPS is always on with the SPFx development certificate (managed through `@rushstack/debug-certificate-manager`); the server listens on `localhost`.
- Vite and `@vitejs/plugin-react` are regular dependencies of the package, so a project adds only `spfx-fast-serve-helpers` and a `"serve": "fast-serve"` script.

## Rationale

- Zero setup matches how SPFx developers already work (`npm run serve`), and keeps migration from `heft start` to one install and one script.
- Owning the Vite configuration keeps the SPFx contract intact: settings the loader, facades and HMR rely on are re-applied over the user file, and the guard warns about attempts to change them.
- The extend file follows the classic model users know (a dev-only file the project owns), costs almost nothing at startup, and covers what a translation can't express (Vite plugins for SVG components, Less, Babel macros). Loading it as Vite's own config file gives bundling of TypeScript/ESM/CJS, local imports and restart on change for free.
- Translating webpack customizations was researched and rejected by the user: it would run user build code at every start (about 0.65 s extra), depend on heft internals and webpack plugin internals, and still could not map loaders or plugins.
- A small option set and a small public entry are easy to keep compatible across SPFx minors; the version-locked package can change internals freely.

## Consequences

- Most projects need no configuration. Projects with a heft webpack customization maintain a second, dev-only file; the two can drift, and drift in an existing extend file is not detected (the hint is silent once the file exists). Importing the same helpers in both files is the recommended way to keep values in sync.
- The extend file is Vite configuration: a Vite major upgrade can break it, so the Vite major changes only with a new SPFx minor line of the package, and `context.viteVersion` lets a file branch on it.
- `defineConfig` and the context fields are public API and need compatibility within an SPFx minor line.
- Users can still break the SPFx contract with plugins (for example a second React plugin or a late `config()` hook); the guard warns but cannot prevent it.
- Old classic-fast-serve settings map to the new options or are dropped (`openUrl` → `pageUrl`, `config` → `--config`, `fullScreenErrors` → `overlay`; `fast-serve/webpack.extend.js` → `fast-serve/vite.extend.mts`).
- The ready banner prints the page URL with the debug query; the browser is not opened automatically.

## Links

- [CLI, options and startup](../features/cli-and-options.md)
- [Customizing the Vite config](../features/vite-extend-file.md)
- [Architecture overview](../architecture/overview.md)
- [Dev server only; Heft keeps builds, checks and packaging](dev-server-only.md)
- [Match heft behavior for serve configurations and the debug URL](match-heft-serve-behavior.md)
- [Version policy: package follows the SPFx minor](version-policy.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: user decisions recorded in the project handoff notes (amended for the Vite extend file), webpack customization and Vite extensibility research, package manifest, user docs
- Confidence: stated
- Last checked: 2026-11-19
