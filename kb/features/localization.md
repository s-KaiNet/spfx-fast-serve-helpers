---
title: Localized strings
type: feature
status: current
tags:
  - project-kb
  - localization
  - loc
---

# Localized strings

## Summary

Every name in `config/config.json` `localizedResources` (project strings such as `HelloWorldWebPartStrings`, and library strings such as `ControlStrings` from `@pnp/spfx-controls-react`) is bundled from the loc file of the selected locale, with a per-resource fallback to `en-us`. AMD, TypeScript and ES/CommonJS loc files work; non-AMD files print heft's compatibility warning. String edits hot-update the components that use them, or reload when the web part class uses them.

## Behavior

- **Locale:** `--locale` / `"locale"` (default `en-us`), chosen at start. Each resource without a file for that locale falls back to `en-us` with a warning (`<Name>: no "de-de" strings, using en-us`); a resource without any file is skipped with a warning (its import then fails to compile).
- **Paths:** patterns into `lib/` map to the source under `src/` (`.js` or `.ts`); other patterns (strings shipped in `node_modules`) are read where they point.
- **Formats:**
  - AMD (`define([], function () { return { … }; })`) is parsed by Rspack's AMD support (enabled by `amd: {}`);
  - TypeScript or ES/CommonJS modules (`export default`, `export =`, `module.exports`) are wrapped so that the strings object is the module's exports, so `import * as strings from '…Strings'` works as with an AMD file; they print once: `<Name>: <file> is an ES/CommonJS module. fast-serve loads it, but heft copies the compiled lib/ file into dist/ as is and SharePoint loads it with RequireJS, which needs define([], function () { return { ... }; });`.
- **Edits:** a loc file used only by React components hot-updates them (Fast Refresh, state kept); a loc file the web part/extension class imports (the usual case for property-pane strings) reloads the page, like any edit reaching the bundle entry. Loc files in `node_modules` are not watched. Adding a loc file for a new locale needs a restart.
- **Difference from heft:** heft keeps loc files as separate scripts (`<Name>_<locale>.js`, manifest `path` or `localizedPath` so the page's UI language picks the file). fast-serve bundles one locale instead, so strings hot-update and no extra requests are made; the page language does not switch strings, `--locale` does.

## Implementation Notes

- The loc format is decided once at start from the file text (a `define(` call outside comments → AMD). AMD files are aliased directly; module files are aliased to a small virtual CommonJS wrapper that requires the file and exports its default export (or the module itself).
- Library loc files go through the same alias, so a dependency's `import * as strings from 'ControlStrings'` gets the selected locale.

## Links

- [SPFx libraries and config.json externals](libraries-and-externals.md)
- [HMR and React Fast Refresh](hmr.md)
- [CLI, options and startup](cli-and-options.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: implementation behavior (integration tests: AMD, TypeScript `export default` and library loc files, `--locale de-de` with per-resource fallback, component hot update and class reload after string edits); heft's `LegacyExternals` for heft's loc handling.
- Live: a German loc file and `--locale de-de` rendered German strings in a web part, an edit of it reloaded the page with the new text; on the 1000-module project `@pnp/spfx-controls-react` strings rendered in English by default and in German (`ListViewFilterLabel` "Filter") with `--locale de-de`.
- Confidence: high
- Last checked: 2026-11-19
