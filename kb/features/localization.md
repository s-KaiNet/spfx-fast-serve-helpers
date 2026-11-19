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

Imports of the names declared in `config/config.json` `localizedResources` (such as `HelloWorldWebPartStrings`) resolve to modules built from the loc file of the selected locale. Loc files may be AMD JavaScript (the SPFx format), TypeScript, or ES/CommonJS modules; non-AMD formats work in `fast-serve` but trigger a warning because heft-built packages can't load them. String edits hot-update the components that use them.

## Behavior

- **Locale**: `--locale` / `"locale"` (default `en-us`), lowercased. Each resource falls back to `en-us` with a warning (`<Name>: no "de-de" strings, using en-us`) when the selected locale has no file; a resource with no file at all is skipped with a warning.
- **Paths**: `localizedResources` patterns with `{locale}` that point into `lib/` are mapped to the matching source under `src/` with `.js` or `.ts`; other paths (for example strings shipped in `node_modules`) are read where the pattern points.
- **Formats**:
  - AMD JavaScript (`define([], function () { return { … }; });`) is evaluated directly;
  - TypeScript loc files and ES/CommonJS modules (`export default`, `export =`, `module.exports`) are bundled first and work, but print a one-time warning: heft copies the compiled file into `dist/` as is and SharePoint loads it with RequireJS, which needs the `define(...)` form. TypeScript written as `define([], …)` is fine in both.
- **HMR**: loc files, including files a TypeScript loc file imports, are watched; an edit hot-updates the importing component files. In ACEs it reloads the page like every ACE edit.
- **Strings in manifests**: localized `{ "id": "$…" }` titles in manifests are not resolved (see [Serving web parts, extensions and ACEs](serving-components.md)).

## Implementation Notes

- The localization component serves each resource as a virtual module from the project model's loc file lookup; the model caches per locale and invalidates on file changes.
- Loc names are kept out of dependency pre-bundling (marked external there), so a library that imports a `*Strings` module still gets the live, hot-updating module. See [Source pipeline](../architecture/source-pipeline.md).
- Evaluation is sandboxed with a timeout; a loc file that doesn't produce a strings object is an error naming the file.

## Edge Cases

- The locale is chosen once at start (`--locale` or `fast-serve/config.json` `locale`) and fixed for the server's lifetime; to change it, restart `fast-serve` with the new value.
- `export =` in a TypeScript loc file works in `fast-serve` but fails in `heft build` (TS1203); `export default` builds but breaks under RequireJS in production.

## Links

- [Styles, localization and assets in SPFx](../concepts/styles-localization-assets.md)
- [CLI, options and startup](cli-and-options.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [Source pipeline](../architecture/source-pipeline.md)

## Evidence

- Source: user docs, project handoff notes (heft loc-file facts), implementation behavior (project model and localization component)
- Confidence: high
- Last checked: 2026-11-18
