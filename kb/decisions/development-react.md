---
title: Development React from the project for Fast Refresh
type: decision
status: current
tags:
  - project-kb
  - decision
  - react
  - react-fast-refresh
---

# Development React from the project for Fast Refresh

## Summary

Project code runs on the development build of React and react-dom taken from the project's own `node_modules`, not on the production React the SharePoint page ships. This is a deliberate dev/prod difference accepted by the user, because React Fast Refresh needs a development React.

## Context

In production, React and react-dom are SPFx externals provided by the page, always the tenant's production build. React Fast Refresh (through `@vitejs/plugin-react`) hooks into the development build's internals; with the page's production React, components could not be hot-swapped with state kept.

## Decision

- React and react-dom are resolved from the **project** (never from the package), in their development build, and pre-bundled by Vite.
- They are deduplicated, so the project, Fluent UI, PnP controls and other dependencies share one React instance.
- React is not loaded through the SPFx library facades; everything else SPFx (`@microsoft/sp-*`) still comes from the page.
- Vite and `@vitejs/plugin-react` are package dependencies; React stays a project dependency, which also lets the package install with plain `npm install` (no `--legacy-peer-deps`) next to SPFx's Jest/Babel 7 dependencies.

## Rationale

- Fast Refresh with state kept is a core goal of the project; it is impossible without a development React.
- Taking React from the project keeps the version the project was built and tested against, and works with strict pnpm layouts.
- Dedupe prevents the classic "two Reacts" failures (invalid hook calls) when dependencies ship their own React ranges.

## Consequences

- In dev, React warnings and React DevTools work; React 18 replays failed renders, so one render error is reported several times (the error reporting shows it once).
- The page's own React and the project's React coexist; components must not rely on sharing React state with SharePoint's React.
- Behavior differences between development and production React are possible; production must be checked with `heft build`.

## Links

- [SPFx library imports and config.json externals](../features/library-imports-and-externals.md)
- [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)
- [On-demand SPFx library facades with top-level await](on-demand-library-facades.md)

## Evidence

- Source: user decisions recorded in the project handoff notes, user docs (install, migration), implementation behavior (React dedupe and pre-bundling)
- Confidence: stated
- Last checked: 2026-11-18
