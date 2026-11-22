---
title: Startup performance and the persistent cache
type: feature
status: current
tags:
  - project-kb
  - performance
  - cache
  - rspack
---

# Startup performance and the persistent cache

## Summary

The dev server keeps Rspack's compile results on disk in `temp/fast-serve/cache` (Rspack persistent cache), so a start after the first one compiles almost nothing: spfx-bench (1000 modules) is ready in about 0.95 s instead of 2.5 s, spfx-rea in about 0.6 s instead of 1.2 s. The cache version is a fingerprint of everything that can change module output, so a configuration change means one uncached start, never a wrong cache hit. SCSS and static-asset typings are generated after the first compile instead of during it. Other levers (eval source maps, lazy compilation, disabling source maps) were measured and not adopted. Rebuilds and page loads were already within the targets (rebuild ≤ 0.3 s, start < 3 s on spfx-bench) and did not change.

## Behavior

### Persistent cache

- Every dev server (initial start and every [restart](project-restarts.md)) compiles with `cache: { type: 'persistent' }`, storage `filesystem` in `temp/fast-serve/cache` of the project (heft's `temp`, ignored by the watcher; `heft build --clean` keeps it).
- `cache.version` is a hash of: the package version, the Rspack version, a stable text of the final Rspack config (after the extend file is merged; keys sorted, functions by source, regular expressions, class names and own properties of plugin instances, getters not evaluated; `output.hashSalt` left out because it changes on every start), and the contents of the project's configuration files: everything the project model reads (`package.json`, `config/config.json`, `config/serve.json`, `config/sass.json`, component manifests, the tsconfig chain, local-file externals), the extend file and its local imports, and the lock files (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `npm-shrinkwrap.json`).
- Rspack keeps one cache per compiler path and overwrites it when the version differs, so switching `--port`, `--locale` or the extend file's result back and forth means an uncached start each time; `--config` (serve configuration) is not part of the build and keeps the cache. Two instances on one project with different ports or locales overwrite each other's cache.
- Source files are validated by Rspack's snapshot (content and timestamps); files under `node_modules` by the package version (Rspack's managed paths). Edits made while the server was stopped and a syntax error left in a file come out the same as in an uncached compile (checked); a configuration change that alters the generated code (a `DefinePlugin` value in the extend file) is picked up after the restart (checked).
- When the extend file sets `cache` (for example `false`, or `true` for memory only), fast-serve leaves it alone. Unit and integration tests that compile once keep Rspack's memory cache.

### Startup order

- The typings generators (SCSS through heft's Sass processor, static assets) start after the first compile. Running them during the compile competed for the main thread (heft's Sass processor loads Sass and PostCSS and compiles every stylesheet): on spfx-bench the cached compile took 0.9 s with them and 0.4 s without. Since `1.24.0-beta.9` heft's processor cache (in `temp/fast-serve/sass-typings`) lets a cached start skip compiling unchanged stylesheets, and unchanged typings are not rewritten ([details](styles-and-typings.md#typings)).
- The Sass implementation is loaded on the first Sass compile, not when the config is built. With the cache nothing is compiled at start, so the first SCSS edit after a cached start pays for loading Sass and starting its compiler (about 0.5 s instead of 0.1 s); typings generation loads Sass in the background anyway.

### Measured (single runs, Linux, Node 24, Rspack 2.3.3; process start → ready line)

| | before (`1.24.0-rspack.9`) | uncached | cached |
|---|---|---|---|
| spfx-bench compile / ready (wall) | 1.97–2.07 s / 2.63–2.70 s | 1.95 s / 2.52 s | 0.39 s / 0.94 s |
| spfx-bench RSS after start | 0.58 GB | 0.57 GB | 0.47–0.51 GB |
| spfx-rea compile / ready (wall) | 0.62 s / 1.30 s | 0.69 s / 1.21 s | 0.07 s / 0.59 s |
| restart after an extend-file edit (spfx-rea) | | 0.1–0.5 s | |

Rebuilds (unchanged): spfx-bench leaf/mid TSX 65–140 ms, SCSS 100–180 ms; spfx-rea TSX 50–110 ms. Live on SharePoint: spfx-bench save → DOM 180–240 ms (TSX), F5 2.3–3.1 s until both web parts rendered; spfx-rea save → DOM 120–170 ms.

### Levers measured and not adopted

| Lever | Result | Decision |
|---|---|---|
| `devtool: 'eval-cheap-module-source-map'` | same start and rebuild times as `cheap-module-source-map` on spfx-bench, higher memory | keep `cheap-module-source-map` |
| `devtool: false` | about 10% faster start and rebuild | rejected: terminal error mapping, overlay locations and debugging need source maps |
| `lazyCompilation` (imports) | no start difference (spfx-rea's only `import()` is a small property-pane chunk, spfx-bench has none); its client calls the dev server from the SharePoint origin | not adopted |
| `incremental` | Rspack 2 enables every incremental pass in development by default | nothing to change |
| watch options | rebuild wall time is 10–40 ms above Rspack's own time, including the watcher | defaults kept |
| Sass compiler reuse | sass-loader's modern compiler is already created once per Sass implementation and reused | nothing to change |

## Constraints

- A dependency change that touches neither the lock file nor a package version (a linked package edited in place) is not seen by the cache fingerprint; Rspack still validates the files it tracks, but deleting `temp/fast-serve/cache` is the reset.
- The first page load after a start competes with typings generation for a few hundred milliseconds on large projects.

## Links

- [Rspack compile](rspack-compile.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [Restarts on project changes](project-restarts.md)
- [Styles, theme tokens and typings](styles-and-typings.md)
- [Rspack facts and references](../references/rspack.md)
- [Final benchmark against Vite fast-serve and heft start](../operations/final-benchmark.md)

## Evidence

- Source: measurements with a start/edit harness on copies of spfx-rea and spfx-bench (fresh tarballs, ports 4431/4432), CPU profiles of the start, live checks in headless Chrome on SharePoint Online; unit tests for the fingerprint and the cache version
- Confidence: high for the cache behaviour; timings are single runs on one machine
- Last checked: 2026-11-20
