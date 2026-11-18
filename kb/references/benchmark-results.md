---
title: Benchmark results and performance conclusions
type: reference
status: current
tags:
  - project-kb
  - reference
  - benchmark
  - performance
---

# Benchmark results and performance conclusions

## Summary

Unbundled Vite beats `heft start` by orders of magnitude on server start and edit latency, but loses on full page loads of very large projects, because the browser has to fetch and evaluate one request per module. The main benchmark was run in the PoC era against a generated 1000-module project live on the tenant; the package itself was then tuned and checked with targeted runs. This page keeps the conclusions; the procedure is in [Benchmark method](../operations/benchmark-method.md).

## Current Knowledge

### PoC-era benchmark (1000 generated modules, medians of 3)

Setup: SPFx 1.24.1, heft 1.3.2, webpack 5.105.4, Vite 8.3.8, Chrome 153 headless, a 2-core laptop; worst case where the page loads all ~1000 TS modules and 122 SCSS files. Measured before the on-demand library facades and the warmup rework.

| | `heft start` | Vite (PoC) |
|---|---|---|
| server start | 22.6 s cold and warm | 1.24 s cold / 0.3 s warm |
| edit → DOM updated | ~4–5 s (rebuild ~1 s + full reload) | 34–61 ms (Fast Refresh, state kept) |
| cold page load | 3.3 s | 8.5 s |
| F5 reload | 2.6 s | 5.8 s |
| localhost requests | 6 (774 KB gzip) | ~1180 (15.7 MB, uncompressed, inline source maps) |
| server memory | 1.2–1.3 GB | ~0.45 GB |

- At 250 modules: heft F5 2.4 s vs Vite 3.6 s; Vite edits 23–34 ms; heft start 13.6 s vs 0.3–0.8 s.
- At 2000 modules (server only): heft start 34.8 s; Vite 1.9 s cold / 0.3 s warm. Server-side crawl cost grows linearly and stays small (0.43 s warm at 1000, 0.65 s at 2000); extrapolated F5 at 2000 modules is ~9–11 s.
- A small project (PoC HelloWorld): Vite ready in ~0.3 s vs heft cold ~5.7 s; TSX edit to in-page update < 250 ms.

### What dominates page load

- **SharePoint itself** takes ~1.1–1.4 s of every load (it requests `manifests.js` at ~1.1–1.3 s with either server).
- **The browser's module waterfall dominates**: ~1200 ES module requests, graph depth ~13. With transforms cached, a load still took 6.3 s, while a browser-free crawl of the same graph took 0.43 s.
- **Transforms come second**: ~2 s extra, only on a cold server.
- React render after the last module ~0.5 s.
- Barrels re-exporting modules the page uses anyway made no measurable difference; only barrels pulling in unused modules cost requests.
- Vite's CPU cost moves to the first page load (~5 CPU-s at 1000 modules); idle and edit CPU are near zero.

Conclusion: rely on HMR rather than F5 on very large projects; bundled dev mode is the known remedy for load time but was ruled out (see [Unbundled dev server and entry-graph warmup](../decisions/unbundled-dev-and-warmup.md) and [Dev vs production differences](../limitations/dev-vs-production.md)).

### Package tuning results

- **Warmup rework** (Vite `server.warmup` off, entry graph warmed after the first pre-bundling, Sass typings after it): cold start → optimizer done 4.5 s → 1.9 s; cold load of the PnP-heavy web part 6.97 s → 4.48 s (PoC ~3.8 s). The cause was warmup flooding plus unfiltered pre-bundle plugin hooks.
- **On-demand library facades**: the web part was ready ~300 ms sooner than with the PoC's preload; resolving an already-loaded library costs ~1 ms; listing libraries in the debug manifest costs ~400 ms because the loader resolves them before running the shim; the per-chunk preload in pre-bundles turned 154 ms of sequential awaits into 52 ms. See [On-demand SPFx library facades](../decisions/on-demand-library-facades.md).
- **Acceptance**: 32 loads of the benchmark page, median 5.5 s, no hangs. The full harness has not been re-run against the package.

### Reliability

- In the PoC benchmark 9 of 67 Vite page loads stalled: one pre-bundled `react-dom` chunk stayed pending in Chrome while `curl` got it in 35 ms, and RequireJS failed the web parts after its 90 s timeout. `heft start` had 0 failures in ~24 loads.
- After the package changes it reproduced only in an older build (8 of 64 loads) and not in the acceptance runs; the issue is skipped, with HTTP/1.1 as the likely fix if it returns (see [Deferred work](../roadmap/deferred-work.md)).

### Heft behavior seen while benchmarking

- `heft start` without `--clean` is no faster; lint is skipped in watch mode.
- Heft 1.24.1 writes port 4321 into the served `manifests.js` regardless of `serve.json` `port`; the harness had to rewrite that response. With two bundles on a page, heft's auto-reload fired only on the first edit. See [SPFx 1.24 Heft pipeline](spfx-heft-pipeline.md).

## Links

- [Benchmark method](../operations/benchmark-method.md)
- [Unbundled dev server and entry-graph warmup](../decisions/unbundled-dev-and-warmup.md)
- [Known issues and fragile points](../limitations/known-issues.md)
- [Vite 8, Oxc and Rolldown facts](vite-oxc-rolldown.md)

## Evidence

- Source: benchmark research report (live on the tenant, local server measurements), top-level-await externals prototype timings, project handoff notes (performance section)
- Confidence: high for measured numbers; the 2000-module page-load figure and heft's "realistic 4–5 s" edit figure are inferred
- Last checked: 2026-11-18
