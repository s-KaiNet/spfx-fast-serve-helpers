---
title: Benchmark method
type: operation
status: current
tags:
  - project-kb
  - operations
  - benchmark
  - performance
---

# Benchmark method

## Summary

Performance of `fast-serve` against `heft start` is measured on the large generated benchmark project, live on the tenant, with a Node harness that drives headless Chrome through raw CDP. It measures server start, page loads (cold, F5, warm server with empty cache), edit-to-DOM latency, network volume and server memory/CPU, plus a browser-free crawl that isolates server transform cost. The full harness was last run against the proof-of-concept plugin; the package itself has only targeted performance runs, and re-running the harness is optional before a release.

## Current Knowledge

### Setup

- The benchmark project (see [Local testing and consumer setup](local-testing-and-consumer-setup.md)) is generated with `node tools/generate.mjs --modules N [--barrels on|off]` (250, 1000 or 2000 modules); it has its own solution and web part ids, port 4341, and both `heft build` and `heft build --clean` pass.
- Page: the draft `SitePages/spfx-bench.aspx` on the dev site with both benchmark web parts. Browser: Chrome headless with the saved tenant profile, CDP on a dedicated port.
- Report medians of 3 runs (5 for server start); note machine load, since other work on the machine adds noise.

### What is measured and how

- **Server start**: spawn until ready. For heft, until `/temp/build/manifests.js` returns 200 (webpack-dev-middleware holds it until the first compilation); for Vite, until listening, and with forced re-optimization until the dependency metadata is written. Cold = `heft start --clean` / forced pre-bundling.
- **Page load**: a new tab per server start; `sessionStorage['spfx-debug']` is pre-set so the "Allow debug scripts?" prompt is skipped. "Rendered" is a timestamp each web part root writes in an effect, taking the later of the two, with all tree nodes present. The SharePoint canvas time comes from a MutationObserver. Load types: cold (fresh server and cleared browser cache), F5 (reload keeping the cache), warm server with empty cache.
- **SharePoint baseline**: the same page without the debug query, to separate SharePoint's own time (about 1.1–1.4 s) from the dev server's.
- **Edits**: the harness rewrites a token in a leaf component, a mid-tree component and a `.module.scss` file and records when the DOM (or computed style) shows it, via MutationObserver plus a 50 ms poll. For heft it waits for the build to finish and reloads itself, because heft's auto-reload is unreliable with two bundles on a page.
- **Network**: CDP Network events (request count, bytes).
- **Server resources**: RSS and CPU of the process tree sampled from `/proc` every 250 ms.
- **Crawl**: a browser-free HTTP/2 crawl of Vite's module graph from both entries, requesting each import as soon as it's seen; it separates server-side transform cost from the browser's request waterfall.
- Heft's `manifests.js` hard-codes port 4321 even when `serve.json` sets another port (a heft 1.24.1 bug); the harness rewrites that response through CDP `Fetch` when measuring heft on port 4341.

### Reproduce

```bash
cd /home/sergei/Projects/spfx-bench
node tools/generate.mjs --modules 1000
node tools/bench/start.mjs 3 heft,vite
node tools/bench/crawl.mjs 3
node tools/bench/run.mjs sp-baseline|vite|heft|vite-warmup|vite-loads|vite-nohold 3
node tools/bench/summarize.mjs
```

The browser runs need Chrome with the tenant profile on the harness's CDP port. The harness still runs the PoC-era Vite setup for its `vite` targets; benchmarking the package means pointing it at `npm run fast-serve` instead. The generator and harness are also preserved in this repository next to the benchmark report.

### Lighter checks used for the package

- Startup timing from the CLI's ready banner and the pre-bundling ("optimizer done") moment, cold.
- Repeated live page loads of the benchmark page (for example 32 loads, median and hang count) to check reliability.
- Timing the on-demand SPFx library loading in the browser (time to web part ready, per-library await cost).

Results and their interpretation belong to the benchmark reference and the performance decisions, not to this procedure.

## Links

- [Local testing and consumer setup](local-testing-and-consumer-setup.md)
- [Live verification on a SharePoint tenant](live-verification.md)
- [Unbundled dev server and entry-graph warmup](../decisions/unbundled-dev-and-warmup.md)
- [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md)
- [Dev vs production differences](../limitations/dev-vs-production.md)

## Evidence

- Source: benchmark research report, project handoff notes (performance section)
- Confidence: high for the method; the harness has not been re-run against the package
- Last checked: 2026-11-18
