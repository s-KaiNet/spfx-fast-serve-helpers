---
title: Final benchmark against Vite fast-serve and heft start
type: operation
status: current
tags:
  - project-kb
  - benchmark
  - performance
---

# Final benchmark against Vite fast-serve and heft start

## Summary

The Rspack line (`1.24.0-rspack.11`) was measured against the Vite line (`1.24.0-beta.3`) and `heft start` on three generated SPFx projects with 100, 250 and 500 React components and two bundles on one SharePoint page. Vite's bundled dev mode was not part of this comparison. Rspack loads the page at heft's level with 3 localhost requests at every size. Vite's page load grows by about 0.47 s per 100 components and is slower from 100 components on. Rspack's time from start to the first rendered page is shorter than Vite's at every measured size. Vite keeps the fastest edit loop (30–55 ms against 120–260 ms), the fastest time to "ready" (0.8 s, flat) and the lowest memory. heft never applied an update with two bundles on the page. Recommendation at the time: the Rspack line from about 100 components or Fluent/PnP-sized dependency trees, the Vite line for small projects. Outcome: the Rspack implementation became the main v1.24 line (`1.24.0-beta.5`); the Vite implementation is no longer developed.

## Procedure

- Projects: spfx-bench's generator with `--modules` 118 / 289 / 573. Components = modules − 4 − 12 % utils, which gives exactly 100 / 250 / 500 `.tsx` components, plus 14 / 35 / 69 `.module.scss`. Both web parts are kept (tree + PnP, two bundles). Each size has two copies with identical sources, because the two fast-serve packages share a package name and cannot be installed side by side.
- Harness: raw CDP on a headless Chrome with the saved SharePoint profile, one tab. Each server and size gets 3 starts. Every start has 1 cold load (browser cache cleared) and 2 F5, and the last start adds 3 edits each to a leaf TSX, a mid TSX and a `.module.scss`. Medians are reported. Each server first gets one discarded warm-up start.
- Readiness: port listening, `ready in` printed, first bundle served (Rspack), `manifests.js` 200 (heft). "Rendered" = both web parts in the DOM, timed from navigation start.
- React state check: before each edit the edited component's `useState` is set with a click and read from the current React fiber tree. A page marker on `window` detects reloads.
- Rspack ran with the persistent cache deleted before every start (worst case), plus 3 start-only runs with the cache.
- heft: the `4321` base URL in `manifests.js` is rewritten in the browser. With two bundles heft does not apply hot updates, so the harness records when the hot update was fetched and then times a manual F5.

## Results

| 100 / 250 / 500 components | Rspack | Vite | heft |
|---|---|---|---|
| start → ready / first bundle | 1.80 / 1.91 / 2.29 s (cached 1.09 / 1.22 / 1.17 s) | 0.79 / 0.79 / 0.77 s (no bundle) | 13.0 / 15.3 / 18.6 s |
| start + first page rendered | 4.8 / 5.1 / 5.7 s | 5.2 / 6.2 / 7.1 s | 16.2 / 18.6 / 21.8 s |
| cold load | 2.98 / 3.17 / 3.37 s | 4.45 / 5.38 / 6.32 s | 3.14 / 3.22 / 3.16 s |
| F5 | 2.11 / 2.20 / 2.35 s | 3.11 / 3.56 / 4.43 s | 2.13 / 2.25 / 2.46 s |
| localhost requests per load | 3 / 3 / 3 | 192 / 384 / 702 | 6 / 6 / 6 |
| bytes per cold load | 6.2 / 6.9 / 8.0 MB (uncompressed) | 10.3 / 11.3 / 12.9 MB | 0.68 / 0.69 / 0.72 MB (gzip) |
| server CPU per cold load | 0.06 / 0.05 / 0.18 s | 1.37 / 2.10 / 3.45 s | 0.19 / 1.10 / 0.19 s |
| leaf TSX edit → DOM | 123 / 170 / 220 ms | 36 / 46 / 55 ms | no update; manual F5 2.4–2.8 s |
| mid TSX edit → DOM | 136 / 154 / 162 ms | 49 / 32 / 33 ms | no update; manual F5 2.6–2.9 s |
| SCSS edit → DOM | 178 / 264 / 213 ms | 29 / 38 / 50 ms | no update; manual F5 2.8–3.1 s |
| state kept, reloads | 9/9 per size, none | 9/9 per size, none | – |
| RSS at ready / peak | 448–540 / 450–619 MB | 137 / 316–375 MB | 891–1133 / 904–1161 MB |

- Scaling per 100 components: Rspack +0.12 s start (cold cache), +0.10 s cold load, +24 ms per leaf edit. Vite has a flat start, +0.47 s cold load, +0.33 s F5, +128 requests (about 64 fixed plus 1.28 per component) and +0.5 s server CPU per cold load. heft adds +1.4 s start; its loads stay flat.
- Crossover: no size in the measured range where Vite loads faster. Extrapolating the fits puts the intersection at zero components. A small project with light dependencies (3 components, about 30 requests) was near parity in earlier research, so the crossover depends on the dependency tree as much as on the component count.
- Vite had one RequireJS load-timeout hang in 9 cold loads at 100 and at 500 components (the known occasional hang). Rspack and heft had no failed loads.
- heft with two bundles: webpack rebuilt and the page fetched both hot-update files 0.5–1.0 s after the write. The DOM never changed and the page never reloaded, in 27 of 27 edits.

## Not measured

Vite's bundled dev mode (out of scope), heft with a single bundle on the page and without `--clean`, server CPU during start, compression of Rspack responses, remote or tunnelled hosts, 1000 components in this round, and the real large customer project.

## Links

- [Startup performance and the persistent cache](../features/performance-and-cache.md)
- [HMR and React Fast Refresh](../features/hmr.md)
- [Acceptance run on the test projects](acceptance-run.md)
- [Roadmap overview](../roadmap/overview.md)
- [SPFx 1.24 Heft pipeline](../references/spfx-heft-pipeline.md)

## Evidence

- Source: harness runs on one machine (Intel i7-7500U, 22 GB, Node 24.21.0, headless Chrome 153, SharePoint Online), 3 starts / 3 cold loads / 6 F5 / 3 edits per type per cell, 2026-11-20
- Confidence: high for the relative ordering and trends; absolute times depend on the machine and tenant
- Last checked: 2026-11-20
