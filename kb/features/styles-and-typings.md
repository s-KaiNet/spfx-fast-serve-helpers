---
title: Styles, theme tokens and typings
type: feature
status: current
tags:
  - project-kb
  - styles
  - sass
  - css-modules
  - theming
  - typings
---

# Styles, theme tokens and typings

## Summary

Sass and CSS compile like heft: `.module.scss`/`.module.sass` are CSS modules whose class names are **identical to heft's** (`<class>_<8 hex>`), other style files are global, theme tokens resolve at runtime against the page theme, and CSS from `node_modules` (for example a library's global stylesheet or PnP's compiled `.module.scss.css`) goes through the same rules. `config/sass.json` (merged through `extends`, including the rig's) supplies `silenceDeprecations`, `ignoreDeprecationsInDependencies` and `loadPaths`. SCSS typings (`temp/sass-ts`) and static asset typings (`temp/static-asset-ts`) have heft's content, are checked at start and kept up to date while serving, and a typing file is written only when its content changes.

## Behavior

### Compile chain

- Sass: `sass-loader` with the project's `sass-embedded` (else `sass`), modern compiler API, `style: expanded` (sass-loader's development default, same as heft's Sass plugin). Missing Sass or `@microsoft/sp-css-loader` is a startup warning; style imports then fail to compile.
- CSS: the project's `@microsoft/sp-css-loader` (heft's own loader) after Sass, with heft's split: `.module.css`/`.module.scss.css` and `.module.scss`/`.module.sass` as CSS modules, everything else (`.global.scss`, plain `.scss`, plain `.css`, library CSS) global. Styles are inserted by `@microsoft/load-themed-styles` (bundled, as with heft).
- Imports: Sass `pkg:` URLs resolve through the `NodePackageImporter` of the same Sass package (`@import 'pkg:@fluentui/react/dist/sass/References.scss'`); when it finds nothing, and for every `~` import (`@import '~@fluentui/react/dist/sass/References'`, also in `@use`, `@forward` and `meta.load-css`), fast-serve's package-folder importer resolves like heft: the package folder is looked up in `node_modules` from the importing file's folder upwards (real path, so pnpm and nested copies work), the package's `exports` field is ignored, and Sass then tries the partial (`_x.scss`), the extensions (`.scss`, `.sass`, `.css`) and index files. So the classic template line `@import '~@microsoft/sp-office-ui-fabric-core/dist/sass/SPFabricCore.scss'` compiles although that package's `exports` hide `dist/sass`, and `~` imports inside the imported package resolve from that package's own folder. Only what this importer can't find falls through to sass-loader's resolver (bare package specifiers, aliases). Files loaded this way are reported to Rspack as dependencies, so edits to them rebuild. `loadPaths` from `sass.json` are passed to Sass. `@use` must come before `@import` (Sass rule).
- `url()` in CSS (also in `node_modules` CSS) becomes an emitted asset served from the dev server.
- Deprecations: `silenceDeprecations` silences them (the SPFx rig silences `mixed-decls`, `import`, `global-builtin`, `color-functions`, so a default project starts without Sass noise); `ignoreDeprecationsInDependencies` maps to Sass `quietDeps`. Anything not silenced appears as a compile warning.
- A `sass.json` change [restarts](project-restarts.md) fast-serve.

### Class names equal to heft's

- heft compiles `src/x/Y.module.scss` to `lib/x/Y.module.scss.css` first; webpack then loads that file and `sp-css-loader` hashes it: `HMAC-SHA1(key = absolute path of the lib CSS file, data = the CSS it receives)`. With the rig's `sourceMap: true` heft writes the Sass output plus a newline and a `/*# sourceMappingURL=Y.module.scss.css.map */` line. In development builds (`heft start`, `heft build` without `--production`) webpack has a devtool, so `source-map-loader` runs first and removes that comment line: the hashed data is the Sass output plus one newline. Production builds without `buildSourceMaps` keep the comment, so their names differ from development names.
- fast-serve gives `sp-css-loader` a class-name function that maps a Sass source inside `srcFolder` to the CSS file heft would write (the `lib` entry of `cssOutputFolders`, `doNotTrimOriginalFileExtension` for the name) and, when `sourceMap` is on, appends the newline that remains after `source-map-loader` (development names, as `heft start` produces). Sass output is the same text as heft's, so names match. Library CSS is hashed by its own path, as heft does.
- Checked: on a fixture against heft's own Sass processor (`.module.scss` with `pkg:`, `~` and `@use`, `.module.sass`, and `~`/`pkg:` imports of an exports-hidden partial with a nested `~` import), and on the small test project against the class names in heft's development `dist/` bundles (all equal, including a `.module.scss` importing `SPFabricCore.scss` through `~`). Before `1.24.0-rspack.14` the comment line was hashed too: names matched heft's production build and an algorithm over `lib/`, but not heft's development bundles.
- Names depend on the absolute project path (heft's too), so they differ between machines; never hard-code them. During serving a content edit changes the hash (heft keeps the first hash per file for the process lifetime); the hot-styles runtime relies on new names.

### Theme tokens

- Tokens such as `"[theme:themePrimary, default: #0078d4]"` stay in the CSS string and are replaced by load-themed-styles from the page theme when the style is inserted (also on hot updates).
- Fluent's `References.scss` variables are plain values (`$ms-color-themePrimary` is `#0078d4`); the themed tokens come from Fluent's `themeOverrides` partial, the same as with heft.

### Typings

- **SCSS typings:** heft's own Sass processor from the project's `@rushstack/heft-sass-plugin` produces the typings with the merged `sass.json` (`srcFolder`, `exportAsDefault`, extensions, `excludeFiles`), byte-identical to `heft build`, for `temp/sass-ts/**/X.module.scss.d.ts` (and `secondaryGeneratedTsFolders`). The processor writes into a private staging folder under `temp/fast-serve/sass-typings`, next to its own incremental cache (heft's `loadCacheAsync`: per-file content hashes and the import graph, keyed on the Sass options). fast-serve then publishes a staged typing to the real folders only when the real file's content differs.
- At start (after the first compile, see [Startup performance](performance-and-cache.md)) the processor compiles only stylesheets whose content changed since the last run (with the cache), and every current stylesheet's staged typing is compared with the real one: a missing or different real typing is written, everything else keeps its timestamp. If the staging folder is missing, or a stylesheet has no staged typing after the cached compile (it was deleted, or the stylesheet failed last time), the cache is dropped and every stylesheet is compiled again, which also reports a remaining Sass error again.
- While serving, adding or editing a stylesheet under `srcFolder` compiles it (a changed partial recompiles its consumers); staged typings the processor rewrote (found by timestamp) and the edited files' typings are published when their content differs. An edit that changes only property values leaves the typing untouched (heft's processor itself rewrites it). Deleting a stylesheet removes its published typings; the staged copy stays, so adding the same file back restores the typing even though the processor sees no content change. Sass errors are reported and the previous typing stays.
- Typings removed while fast-serve was stopped are written again at the next start; typings of stylesheets deleted while it was stopped are left in place (heft doesn't delete them either).
- **Static asset typings:** `temp/static-asset-ts/**/X.png.d.ts` for the extensions of the merged `config/static-asset-typings.json` (rig: `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`), checked at start and when an asset is added or deleted under `src`, written only when missing or different. Without that config nothing is written.
- **Writes are atomic:** a typing is written to a temporary file next to it and renamed over the target (with a few retries and a plain write as fallback when Windows refuses the rename), so editors and type checkers never read a half-written file. Unchanged typings keep their timestamps across starts, restarts and edits; before `1.24.0-beta.9` every start rewrote every SCSS typing, which made a type checker reading them at the same moment report false "is not a module" errors.
- **Typings updates:** after each write or removal the generators announce the typing files they wrote and removed through the build's page channel (see [Architecture](../architecture/overview.md#features-and-the-page-channel)); nothing is announced when nothing changed. A background type check can use it to re-read exactly those files.
- Changes are detected by a recursive file-system watch of the source folder, so new files that nothing imports yet are covered; the watch closes with the server.

### Assets

- Images, fonts and other binaries from heft's list are `asset/resource` (`[name]_[contenthash][ext]`) with absolute dev-server URLs; `.sprite.svg` is `asset/source`.

### HMR

- A style edit re-evaluates the style module and re-renders the importing component without a page reload; elements don't pile up (see [HMR and React Fast Refresh](hmr.md)). Live: an edit that added a class, changed a property and swapped an import applied in about 0.1–0.2 s, the theme colour updated, and the SCSS typing gained the new class.

## Edge Cases

- `.module.css` inside `src` is hashed by its own path (heft's handling of project `.module.css` was not checked).
- `@pnp/spfx-property-controls` 3.13's already-hashed CSS is not special-cased (same as the Vite implementation, cut by the user).
- Theme changes on an open page are not followed (tokens resolve once per insert), as with heft.

## Links

- [Startup performance and the persistent cache](performance-and-cache.md)
- [Rspack compile](rspack-compile.md)
- [HMR and React Fast Refresh](hmr.md)
- [Project model](../architecture/project-model.md)
- [TypeScript and tsconfig](typescript-and-tsconfig.md)
- [Background type check](type-checking.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: heft-sass-plugin 1.5 `SassProcessor` (output name, source-map comment, `style: expanded`, `~` → `pkg:` rewrite and package-folder resolution that ignores `exports`), the heft webpack generator's `source-map-loader` rule for development builds, `sp-css-loader` 1.24.1 and the heft webpack generator (class-name function, module/global rules); integration tests with real compiles (heft parity, `pkg:`, `~`, `.sass`, global and `node_modules` CSS with `url()`, deprecations on/off, `loadPaths`) and typings tests (start, add, edit, delete).
- Local and live (copy of the small test project, `1.24.0-rspack.14`): the template line `@import '~@microsoft/sp-office-ui-fabric-core/dist/sass/SPFabricCore.scss'` in a `.module.scss` compiled (it failed before with "Can't find stylesheet to import"), `$ms-font-size-xl` gave 21 px, all class names in the served bundles equal those in heft's development `dist/` bundles, SCSS typings byte-identical to heft's, an edit rebuilt in about 0.1 s; on the SharePoint page the web part rendered with heft's class names, 21 px and the site theme's primary colour.
- Live (copy of the small test project, `1.24.0-rspack.7`): 0 warnings at start with the rig's `sass.json`, Fluent `$ms-*` variables through `pkg:` and `~` imports rendered (21 px font), theme token resolved to the site theme's primary colour, SCSS edit hot-updated without reload, typings updated for an edited and a newly added `.module.scss` and a new image; 1000-module project compiled with 0 warnings and all 484 class names equal to heft's algorithm on its `lib/`.
- Local (copies of the small test project and the 1000-module project, `1.24.0-beta.9`): one priming start and three cached starts each changed no typing timestamp (7 and 121 typings); appending a class to a `.module.scss` changed only that typing, reverting it changed it back; heft's processor cache made a cached start skip compiling unchanged stylesheets (a staged typing kept its timestamp in the tests).
- Confidence: high
- Last checked: 2026-11-22
