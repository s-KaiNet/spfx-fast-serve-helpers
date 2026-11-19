---
title: Rspack with our own configuration
type: decision
status: current
tags:
  - project-kb
  - decision
  - rspack
  - architecture
  - heft
---

# Rspack with our own configuration

## Summary

The Rspack implementation of `fast-serve` builds its Rspack configuration from scratch, from fast-serve's own project model. It never generates, loads or patches heft's webpack configuration and never imports SPFx heft-plugin internals. Manifests, externals, localization and the CSS pipeline are fast-serve's own, modelled on the Vite implementation.

## Context

- The Vite implementation is finished but makes 1000+ module requests per page on big projects; page loads there are 2–3× slower than heft's. A bundled dev server keeps heft's request count.
- The Rspack prototype showed that Rspack can run heft's generated config with small patches, but only by depending on heft internals (the configuration generator, legacy externals, a manifest plugin that detects externals through webpack-only fields) and by dropping heft plugins that use webpack-only hooks. Those internals can change in any SPFx minor.

## Decision

- Bundler: `@rspack/core` 2.x with `@rspack/dev-server`, `@rspack/plugin-react-refresh` and `builtin:swc-loader`, shipped as package dependencies.
- Own config: entries, AMD output, externals, loaders and plugins are produced by fast-serve from the project model (`config/config.json`, manifests, `serve.json`, SPFx libraries in `node_modules`, `config.json` externals, tsconfig, `config/sass.json`).
- Not allowed: heft's `WebpackConfigurationGenerator`, `ManifestPlugin`, `AsyncComponentPlugin`, legacy-externals helpers or any other `@microsoft/spfx-heft-plugins` internal; running heft's webpack customization scripts automatically.
- Allowed: reading heft's sources and output to learn formats; loading public packages the project already depends on and that heft uses as tools (for example `@microsoft/sp-css-loader` as a loader, `@rushstack/heft-sass-plugin` for SCSS typings, `@rushstack/debug-certificate-manager` for the dev certificate).
- Same product contract as the Vite implementation: zero-config CLI, `fast-serve/config.json`, heft-matching serve configurations and debug URL, development React for Fast Refresh, dev server only.
- Same architecture pattern: config → bundler-free project model → generated artifacts → Rspack compiler and dev server → browser runtime; one module per feature with its own tests.

## Consequences

- Robust against heft-internal changes; output format parity (manifests, AMD dependency lists, CSS class names) must be checked by tests against heft's output instead of being inherited.
- Many Vite-era features become unnecessary (AMD shim, top-level-await library facades, `require()` and AMD rewrites, type-only re-export guard), because webpack semantics already match heft's.
- Heft webpack customizations are not applied; an optional extend file with an Rspack configuration is the planned escape hatch.
- The package is versioned `1.24.0-rspack.<n>` while it is compared with the Vite implementation.

## Links

- [Architecture overview](../architecture/overview.md)
- [Roadmap overview](../roadmap/overview.md)
- [Rspack facts and references](../references/rspack.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: user decision for the Rspack branch (2026-11-19), Rspack prototype research
- Confidence: high
- Last checked: 2026-11-19
