---
title: Unbundled dev server without startup warmup
type: decision
status: current
tags:
  - project-kb
  - decision
  - performance
  - vite
  - warmup
---

# Unbundled dev server without startup warmup

## Summary

`fast-serve` uses Vite's normal unbundled dev server; Vite's `experimental.bundledDev` mode is not used. Nothing is compiled ahead of the page: there is no entry-graph warmup and Vite's `server.warmup` is not set, so project files compile when the page first requests them. Dependency pre-bundling runs in the background after start, and plugins that run inside pre-bundling declare hook filters.

## Context

A benchmark against `heft start` (1000 generated modules, live on the tenant) showed the trade-off of unbundled ES modules: server start 0.3 s vs 22.6 s and edits in 34–61 ms vs 4–5 s, but a cold page load of 8.5 s vs 3.3 s, because the browser fetches and evaluates about 1200 modules. Bundled dev mode is the known remedy for page-load time.

Warmup was tried in two forms. Vite's `server.warmup` for all of `src` competed with dependency pre-bundling and transformed files no component imports. An own entry-graph warmup (wait for the optimizer's first run, then transform the import graph of the bundle entries) replaced it for a while and was then removed by user decision: it only helped the first load of very large projects opened after the server had been idle, slightly hurt when the page was opened right after start, and transformed Sass partials as root stylesheets, which produced Sass "Undefined variable" errors.

## Decision

- **Don't use `experimental.bundledDev`**; keep the unbundled dev server (user decision).
- **No startup warmup** of any kind (user decision): files compile on the page's requests.
- Dependency pre-bundling is unchanged and runs in the background; the server is ready before it finishes.
- Sass and static-asset typings are generated as soon as the server listens.
- Plugins that run inside pre-bundling declare hook filters, so Rolldown only calls them for matching ids.

## Rationale

- The project's goal is the inner loop (instant start, HMR with state kept); bundled dev would reintroduce bundling work per change and trade away the fine-grained HMR the project is built around.
- Measured after the removal on the benchmark project (single runs, both web parts rendered): page opened right after start 5.6–6.0 s, opened after 20 s idle 4.2 s, reload with a warm server 4.4–4.6 s, `ready in` about 400 ms. The warmup's gain was limited to the idle case and did not justify its errors.
- Unfiltered pre-bundle hooks alone made pre-bundling about twice as slow.

## Consequences

- The first page load after a start takes longer than later loads, and cold page loads of very large projects remain slower than `heft start`; users are told to rely on HMR rather than F5. This is a documented limitation (see [Dev vs production differences](../limitations/dev-vs-production.md)).
- Every page load issues one request per module from `localhost` (inline source maps, no compression), which is the main cost to reduce in future work.

## Links

- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Benchmark results and performance conclusions](../references/benchmark-results.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, README, PoC-era benchmark against `heft start`, package performance runs on the generated benchmark project before and after the warmup removal
- Confidence: high
- Last checked: 2026-11-18
