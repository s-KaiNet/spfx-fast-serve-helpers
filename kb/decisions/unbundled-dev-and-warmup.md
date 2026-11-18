---
title: Unbundled dev server and entry-graph warmup
type: decision
status: current
tags:
  - project-kb
  - decision
  - performance
  - vite
  - warmup
---

# Unbundled dev server and entry-graph warmup

## Summary

`fast-serve` uses Vite's normal unbundled dev server; Vite's `experimental.bundledDev` mode is not used. To make the first page load fast, Vite's own `server.warmup` is off and `fast-serve` instead warms only the import graph of the bundle entries, after the dependency optimizer's first run, and generates Sass typings after that.

## Context

A benchmark against `heft start` (1000 generated modules, live on the tenant) showed the trade-off of unbundled ES modules: server start 0.3 s vs 22.6 s and edits in 34–61 ms vs 4–5 s, but a cold page load of 8.5 s vs 3.3 s, because the browser fetches and evaluates about 1200 modules. Bundled dev mode is the known remedy for page-load time. Enabling Vite's `server.warmup` for all of `src` saved about 1.3 s in that benchmark, but in the package it competed with dependency pre-bundling and transformed files no component imports.

## Decision

- **Don't use `experimental.bundledDev`**; keep the unbundled dev server (user decision).
- Vite's `server.warmup` is off. After the server listens, the warmup waits for the optimizer's first run (bounded at 30 s), then transforms the import graph of the bundle entries only.
- Sass typings are regenerated once after the warmup, not during it.
- Plugins that run inside pre-bundling declare hook filters, so Rolldown only calls them for matching ids.

## Rationale

- The project's goal is the inner loop (instant start, HMR with state kept); bundled dev would reintroduce bundling work per change and trade away the fine-grained HMR the project is built around.
- Ordering startup work so pre-bundling finishes first and only reachable modules are transformed cut "cold start → optimizer done" from 4.5 s to 1.9 s and a cold load of a PnP-heavy web part from 6.97 s to 4.48 s; unfiltered pre-bundle hooks alone made pre-bundling about twice as slow.

## Consequences

- Cold page loads of very large projects remain slower than `heft start`; users are told to rely on HMR rather than F5. This is a documented limitation.
- Every page load issues one request per module from `localhost` (inline source maps, no compression), which is the main cost to reduce in future work.

## Links

- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [Benchmark results and performance conclusions](../references/benchmark-results.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, PoC-era benchmark against `heft start`, package performance runs on the generated benchmark project
- Confidence: high
- Last checked: 2026-11-18
