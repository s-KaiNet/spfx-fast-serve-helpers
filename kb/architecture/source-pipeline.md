---
title: Source pipeline
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - vite
  - transforms
  - pre-bundling
  - styles
  - localization
---

# Source pipeline

## Summary

Project source is served file by file as native ES modules, compiled by Vite 8 (Oxc for TypeScript/JSX, Sass for styles) and adapted by `fast-serve`'s components so code written for `heft build` runs unchanged: tsconfig aliases, `*Strings` localization modules, SPFx CSS module names and theme tokens, library CSS compiled with `sp-css-loader`, tsconfig decorator/class-field semantics, `require()` calls and type-only names. Dependencies are pre-bundled by Vite's Rolldown-based optimizer, which `fast-serve` customizes so SPFx libraries, localization modules and library CSS behave the same there. Generated typings in `temp/` keep the editor and `heft build` in sync.

## Current Knowledge

### Resolution

- **Bundle entries and facades** are resolved first: the loader turns `/@spfx/entry/<bundle>` into the generated entry, the externals component turns SPFx library and `config.json` external names into facades (see [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md)).
- **tsconfig `paths` / `baseUrl`**: an early resolver for imports from project scripts tries the candidates the project model derives from the merged tsconfig chain, in tsc's matching order, and takes the first one Vite can resolve. Vite 8's built-in `resolve.tsconfigPaths` is not used because it ignores aliases when `include` comes from an extended config, which is the SPFx rig setup.
- **Localization**: names declared in `config.json` `localizedResources` (`HelloWorldWebPartStrings`) resolve to modules built from `loc/<locale>.js` or `.ts` for the selected locale (falling back to `en-us` with a warning). AMD JavaScript is evaluated directly; TypeScript and ES/CommonJS loc files are bundled to CommonJS with Rolldown first and get a warning, because heft copies them to `dist/` where RequireJS can't load them. Loc files are watched, so string edits hot-update importers.
- **Library CSS**: a library import of `.module.scss` (or similar) that only ships the compiled `.module.scss.css` resolves to a JavaScript module produced by the project's `@microsoft/sp-css-loader`, with SPFx class-name hashing.
- `~` prefixes in Sass imports are stripped, as webpack's Sass loader allowed.
- `react` and `react-dom` are deduplicated to the project's single copy.

### Transformation of project modules

- **TypeScript options**: the project's `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict` and `strictNullChecks` (merged through `extends`) are passed to Oxc as inline tsconfig options, giving legacy decorators and tsc's class-field semantics. Oxc's automatic tsconfig lookup stays off: the SPFx rig's `importsNotUsedAsValues: "remove"` would otherwise keep type-only imports.
- **Defines**: `DEBUG` = `true`, `process.env.NODE_ENV` = `"development"`.
- **`require()` → imports**: relative `require()` calls (images, JSON, scripts, styles) and `require()` of explicit tsconfig `paths` aliases become hoisted ES imports (assets as URLs, JSON as default export, scripts and styles as namespaces).
- **Type-only name checks**: type re-exports written without `type`, and (with `emitDecoratorMetadata`) imports kept only for decorator metadata, are checked against the target module's runtime exports, removed from the served code and reported in the terminal and the browser console.
- **`const enum` checks**: global `declare const enum`s from the project's `.d.ts` files used as values, and relative imports that only resolve to a `.d.ts`, are reported with an explanation; a named import a dependency doesn't export is explained by the bundle shim when the browser links modules.
- **React**: `@vitejs/plugin-react` adds Fast Refresh; the bundle entry imports its preamble.
- Only project modules (and virtual modules) are checked or rewritten; dependencies are left as published.

### Styles at runtime

- CSS modules use SPFx-style names (`<local>_<8-char hash>`) and camelCase locals; CSS source maps are on in dev.
- Vite keeps owning the `<style>` tags (so CSS HMR works), but its style-insertion import is swapped for the themed-styles runtime, which resolves `"[theme:x, default:y]"` tokens from the page's `window.__themeState__.theme` once per insert or hot update. The theme is not watched.

### Dependency pre-bundling customization

- **Entries**: the component entry files from `config/config.json` (there is no `index.html`); `react`, `react-dom`, `react-dom/client` and the JSX runtimes are always included.
- **Rolldown plugins added to pre-bundling**: the externals plugin (ESM and CommonJS facades plus the per-chunk preload), the localization plugin (marks `*Strings` names external so they stay out of pre-bundles and keep hot-updating), and the library CSS plugin (compiles `.module.scss.css` from packages such as PnP controls).
- These plugins use hook filters on module ids; without them Rolldown calls JavaScript hooks for every module of every dependency and pre-bundling becomes about twice as slow.
- Vite's experimental bundled dev mode is not used.

### Generated typings

- **Sass typings** (`temp/sass-ts/**/*.d.ts`) are produced with heft's own Sass processor and the project's rig-aware `config/sass.json`, so output is byte-identical to `heft build`; regenerated on add/change/unlink and once after the startup warmup.
- **Static-asset typings** (`temp/static-asset-ts/**/*.d.ts`) follow the project's rig-aware `config/static-asset-typings.json`, byte-identical to heft's task; written at start and on add, removed on unlink.

## Links

- [Architecture overview](overview.md)
- [Startup and request flows](runtime-flows.md)
- [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md)
- [Styles, localization and assets in SPFx](../concepts/styles-localization-assets.md)
- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [TypeScript source compatibility](../features/typescript-compatibility.md)
- [Styles, theme tokens and asset typings](../features/styles-and-assets.md)

## Evidence

- Source: package code layout notes, project handoff notes, tsconfig/decorators and library SCSS research, implementation behavior (aliases, localization, styles, transforms and externals components)
- Confidence: high
- Last checked: 2026-11-18
