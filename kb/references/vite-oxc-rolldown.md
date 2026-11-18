---
title: Vite 8, Oxc and Rolldown facts relied upon
type: reference
status: current
tags:
  - project-kb
  - reference
  - vite
  - oxc
  - rolldown
  - typescript
---

# Vite 8, Oxc and Rolldown facts relied upon

## Summary

`fast-serve` runs on Vite 8 (Rolldown for dependency pre-bundling, Oxc for TypeScript/JSX transforms). Several Vite/Oxc/Rolldown behaviors — some of them bugs or gaps — shaped the design: the tsconfig handling, the own paths resolver, library CSS, the pre-bundling plugins and the overlay integration. This page records those external facts so future changes (or Vite upgrades) can re-check them.

## Current Knowledge

### Server basics

- **HTTPS means HTTP/2.** Vite 8 always serves HTTP/2 when HTTPS is on (even with a `server.proxy` entry). The skipped page-load hang was a stall inside Chrome on that HTTP/2 connection; serving HTTP/1.1 is the likely fix if it returns (see [Known issues](../limitations/known-issues.md)).
- Serving into a foreign page needs `appType: 'custom'`, `server.origin` (so asset URLs are absolute on the dev server) and explicit `optimizeDeps.entries` (there is no `index.html` to crawl).
- `server.forwardConsole` forwards everything the page logs, SharePoint's own errors included, which is why `fast-serve` replaces it with its own project-only forwarding (see [Error reporting](../decisions/error-reporting.md)).
- Native ES modules evaluate sibling async (top-level-await) modules in parallel, and **ESM caches evaluation errors**: a module that failed to evaluate stays failed until the page reloads; HMR can't recover it because its URL doesn't change.

### Oxc transform and tsconfig

- **Automatic tsconfig lookup is broken for SPFx projects.** Oxc resolves the rig base config's inherited `include` against the project's tsconfig instead of the base file, decides `src/**` isn't covered and applies no tsconfig at all (upstream oxc-project/oxc-resolver#1357, fix proposed in #1358). Without a tsconfig, legacy decorators reach the browser untransformed (SyntaxError; Chrome has no native decorators) and class fields get define semantics instead of tsc's assignment semantics.
- **Pointing Vite at the tsconfig file breaks type imports:** the rig's `importsNotUsedAsValues: "remove"` makes Oxc keep type-only imports, which then fail in the browser (`verbatimModuleSyntax: false` cancels it). Once #1357 is fixed, automatic lookup would hit this for every SPFx project.
- **Inline `oxc.tsconfig.compilerOptions` turns the automatic lookup off.** Passing only `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict` and `strictNullChecks` gives tsc-identical decorators and class fields; `jsx`, `importsNotUsedAsValues` and `preserveValueImports` must not be passed. Vite merges it with `@vitejs/plugin-react`'s `oxc.jsx`. `target: 'es5'` only switches class fields to assignment; nothing else is downleveled. Decorator helpers come from `@oxc-project/runtime`, which Vite serves itself.
- **`emitDecoratorMetadata`:** class tokens match tsc (what DI containers need); an interface or type alias imported without `type` stays as a runtime import (tsc emits `Object` and drops it); primitive metadata and `import type` classes differ from tsc.
- **`const enum`:** per-file compilation can't inline enums declared only in `.d.ts` files (global `declare const enum` → ReferenceError; `export declare const enum` in a `.d.ts` → unresolvable import) or in dependencies (`IconNames` from `@fluentui/font-icons-mdl2` → missing export). `export const enum` in project `.ts` files works as a real enum.
- These conclusions are behind [TypeScript handling without tsc](../decisions/typescript-handling.md) and [TypeScript limits](../limitations/typescript-limits.md).

### Resolution

- **`resolve.tsconfigPaths` ignores the `paths` aliases when the `include` comes from an extended config** — exactly the SPFx rig setup — so `fast-serve` resolves tsconfig `paths`/`baseUrl` itself with tsc's matching rules.
- Vite's Sass compile resolves bare specifiers in `@use`/`@import`, which can be more permissive than a heft Sass setup; Sass `@import` prints a deprecation block per file (noisy on large projects; `@use` avoids it).

### CSS

- **Vite decides CSS-module-ness from the module id** (`.module.` followed by a CSS extension at the end). `X.module.scss.css` is not a CSS module to Vite, and Vite's PostCSS-modules setup differs from SPFx's (no cssnano/autoprefixer, a different hash). That is why SPFx library CSS is compiled with `@microsoft/sp-css-loader` itself and loaded as a JS module.
- CSS imported from pre-bundled dependencies is externalized from the optimized chunk and served as separate global CSS requests.
- Vite owns the `<style>` tags of project CSS, so CSS HMR swaps them. CSS injected through load-themed-styles (SPFx library CSS) cannot be removed, so it does not hot-swap.

### Dependency pre-bundling (Rolldown)

- **Pre-bundling does not run normal Vite plugins.** Anything that must also apply inside dependencies (SPFx library facades, loc externals, library CSS) needs a plugin in `optimizeDeps.rolldownOptions.plugins`; those run **before** Vite's own dependency plugins and can claim imports first.
- Those plugins need **hook filters**: unfiltered hooks run for every module of every dependency and made pre-bundling about twice as slow.
- Rolldown's fallback resolver appends `.css` to an unresolved `./X.module.scss` and, with `.css` mapped to the JS module type, fails with `PARSE_ERROR` on SPFx-library CSS files.
- **Top-level await inside pre-bundles:** facade awaits stay at the top level in import order (scope-hoisted), ESM cycles evaluate correctly, and no deadlock is possible because the awaits only wait on RequireJS outside the ESM graph. A TLA module reached through CommonJS `require()` is a build error (`REQUIRE_TLA`), hence the separate synchronous facade plus one parallel preload per chunk; without that preload, three sibling awaits ran sequentially (154 ms vs 52 ms). Rolldown keeps unused property reads (harmless bloat).
- `optimizeDeps.holdUntilCrawlEnd: false` changed neither speed nor the stall in the benchmark.

### Warmup

- `server.warmup.clientFiles` for all of `src` saved about 1.3 s on a cold load in the PoC benchmark, at ~3 s of CPU after "ready", but in the package it competed with the first pre-bundling and transformed unused files; `fast-serve` warms the entry graph after the optimizer instead (see [Unbundled dev server and entry-graph warmup](../decisions/unbundled-dev-and-warmup.md)).

### Error overlay and Fast Refresh

- Vite's error overlay (`server.hmr.overlay`) renders fine over SharePoint pages and is cleared by the next hot update.
- An overlay opened during the page load makes the next edit a full reload (Vite's rule).
- The overlay footer hint that `fast-serve` rewrites depends on the exact text of Vite's client; a Vite upgrade can silently break it.
- A module exporting components and other values is not a Fast Refresh boundary; its updates bubble up (normal Vite and plugin-react behavior). Fast Refresh needs a development React build.

## Links

- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)
- [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md)
- [SPFx 1.24 Heft pipeline](spfx-heft-pipeline.md)
- [Dependencies, versions and external docs](dependencies-and-external-docs.md)

## Evidence

- Source: research (tsconfig/decorators experiments comparing tsc and Oxc output, top-level-await externals prototype with offline Rolldown edge cases and live checks, library CSS investigation in Vite's optimizer, benchmark), project handoff notes, implementation behavior
- Confidence: high (observed with Vite 8.3.8 and Rolldown 1.2.19); upstream bug status may change
- Last checked: 2026-11-18
