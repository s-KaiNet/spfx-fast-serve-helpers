# spfx-fast-serve-helpers (Rspack branch)

> **Work in progress.** Rspack implementation of `fast-serve` for SharePoint Framework **1.24.x** (Heft) projects. Nothing is served yet: `fast-serve` resolves its options, checks the SPFx version, reads the project (bundles, components, libraries, serve configurations), prints that summary and stops with "the Rspack dev server is not implemented yet". The finished Vite implementation lives on branch `v1.24`.

Goal: the same product as the Vite version, a dev-server-only replacement for `heft start` that serves web parts, extensions and Adaptive Card Extensions inside a real SharePoint page with HMR and React Fast Refresh, built on [Rspack](https://rspack.rs) (`@rspack/core`, `@rspack/dev-server`, `@rspack/plugin-react-refresh`, `builtin:swc-loader`) with fast-serve's own Rspack configuration. Production builds and packaging stay on Heft.

Why: SharePoint loads Rspack's output as a few AMD bundles, like heft's, instead of 1000+ ES module requests per page on large projects. The prototype numbers are in [research/rspack/README.md](research/rspack/README.md).

- Plan and task status: [research/rspack/PLAN.md](research/rspack/PLAN.md)
- Design, decisions, how to test: [research/HANDOFF.md](research/HANDOFF.md)
- Knowledge base for this implementation: [kb/index.md](kb/index.md)

## Requirements (target)

- An SPFx **1.24.x** project; Node.js 22 (from 22.14), 24 or 26.
- The SPFx development certificate, trusted once per machine (`npx heft trust-dev-cert`).

## Try the current state

```sh
pnpm install
pnpm build
node lib/cli.js --help
```

Versions on this branch are `1.24.0-rspack.<n>`. License: MIT.
