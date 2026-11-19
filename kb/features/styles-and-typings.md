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

Sass and CSS compile like heft: `.module.scss`/`.module.sass` are CSS modules whose class names are **identical to heft's** (`<class>_<8 hex>`), other style files are global, theme tokens resolve at runtime against the page theme, and CSS from `node_modules` (for example a library's global stylesheet or PnP's compiled `.module.scss.css`) goes through the same rules. `config/sass.json` (merged through `extends`, including the rig's) supplies `silenceDeprecations`, `ignoreDeprecationsInDependencies` and `loadPaths`. SCSS typings (`temp/sass-ts`) and static asset typings (`temp/static-asset-ts`) are written like heft at start and kept up to date while serving.

## Behavior

### Compile chain

- Sass: `sass-loader` with the project's `sass-embedded` (else `sass`), modern compiler API, `style: expanded` (sass-loader's development default, same as heft's Sass plugin). Missing Sass or `@microsoft/sp-css-loader` is a startup warning; style imports then fail to compile.
- CSS: the project's `@microsoft/sp-css-loader` (heft's own loader) after Sass, with heft's split: `.module.css`/`.module.scss.css` and `.module.scss`/`.module.sass` as CSS modules, everything else (`.global.scss`, plain `.scss`, plain `.css`, library CSS) global. Styles are inserted by `@microsoft/load-themed-styles` (bundled, as with heft).
- Imports: Sass `pkg:` URLs resolve through the `NodePackageImporter` of the same Sass package (`@import 'pkg:@fluentui/react/dist/sass/References.scss'`); `~` imports (`@import '~@fluentui/react/dist/sass/References'`) and bare package specifiers resolve through sass-loader's resolver; `loadPaths` from `sass.json` are passed to Sass. `@use` must come before `@import` (Sass rule).
- `url()` in CSS (also in `node_modules` CSS) becomes an emitted asset served from the dev server.
- Deprecations: `silenceDeprecations` silences them (the SPFx rig silences `mixed-decls`, `import`, `global-builtin`, `color-functions`, so a default project starts without Sass noise); `ignoreDeprecationsInDependencies` maps to Sass `quietDeps`. Anything not silenced appears as a compile warning.
- `sass.json` changes need a restart for now (restarts come with option completion).

### Class names equal to heft's

- heft compiles `src/x/Y.module.scss` to `lib/x/Y.module.scss.css` first; `sp-css-loader` then hashes that file: `HMAC-SHA1(key = absolute path of the lib CSS file, data = its text)`. With the rig's `sourceMap: true` the text ends with heft's `/*# sourceMappingURL=Y.module.scss.css.map */` line, which is part of the hashed data.
- fast-serve gives `sp-css-loader` a class-name function that maps a Sass source inside `srcFolder` to the CSS file heft would write (the `lib` entry of `cssOutputFolders`, `doNotTrimOriginalFileExtension` for the name) and appends heft's source-map comment when `sourceMap` is on. Sass output is the same text as heft's, so names match. Library CSS is hashed by its own path, as heft does.
- Checked: on a fixture against heft's own Sass processor (`.module.scss` with `pkg:`, `~` and `@use`, and `.module.sass`), and on two real projects against their heft `lib/` output (8 and 484 class names, all equal).
- Names depend on the absolute project path (heft's too), so they differ between machines; never hard-code them. During serving a content edit changes the hash (heft keeps the first hash per file for the process lifetime); the hot-styles runtime relies on new names.

### Theme tokens

- Tokens such as `"[theme:themePrimary, default: #0078d4]"` stay in the CSS string and are replaced by load-themed-styles from the page theme when the style is inserted (also on hot updates).
- Fluent's `References.scss` variables are plain values (`$ms-color-themePrimary` is `#0078d4`); the themed tokens come from Fluent's `themeOverrides` partial, the same as with heft.

### Typings

- **SCSS typings:** heft's own Sass processor from the project's `@rushstack/heft-sass-plugin` writes `temp/sass-ts/**/X.module.scss.d.ts` (and `secondaryGeneratedTsFolders`) with the merged `sass.json` (`srcFolder`, `exportAsDefault`, extensions, `excludeFiles`), byte-identical to `heft build`. All files are generated after the server listens; adding, editing or deleting a stylesheet under `srcFolder` regenerates or removes its typing (a changed partial regenerates its consumers). Sass errors are reported and the previous typing stays.
- **Static asset typings:** `temp/static-asset-ts/**/X.png.d.ts` for the extensions of the merged `config/static-asset-typings.json` (rig: `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`), at start and when an asset is added or deleted under `src`. Without that config nothing is written.
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

- [Rspack compile](rspack-compile.md)
- [HMR and React Fast Refresh](hmr.md)
- [Project model](../architecture/project-model.md)
- [TypeScript and tsconfig](typescript-and-tsconfig.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)

## Evidence

- Source: heft-sass-plugin 1.5 `SassProcessor` (output name, source-map comment, `style: expanded`), `sp-css-loader` 1.24.1 and the heft webpack generator (class-name function, module/global rules); integration tests with real compiles (heft parity, `pkg:`, `~`, `.sass`, global and `node_modules` CSS with `url()`, deprecations on/off, `loadPaths`) and typings tests (start, add, edit, delete).
- Live (copy of the small test project, `1.24.0-rspack.7`): 0 warnings at start with the rig's `sass.json`, Fluent `$ms-*` variables through `pkg:` and `~` imports rendered (21 px font), theme token resolved to the site theme's primary colour, SCSS edit hot-updated without reload, typings updated for an edited and a newly added `.module.scss` and a new image; 1000-module project compiled with 0 warnings and all 484 class names equal to heft's algorithm on its `lib/`.
- Confidence: high
- Last checked: 2026-11-19
