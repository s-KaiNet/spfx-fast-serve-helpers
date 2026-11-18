---
title: Styles, theme tokens and asset typings
type: feature
status: current
tags:
  - project-kb
  - styles
  - css-modules
  - theming
  - assets
  - typings
---

# Styles, theme tokens and asset typings

## Summary

Project SCSS and CSS (including CSS modules) are compiled by Vite with SPFx-style class names, theme tokens resolve against the SharePoint page's theme, and CSS-only styles shipped by SPFx libraries (`.module.scss.css`, as in PnP controls) are compiled with the project's own `@microsoft/sp-css-loader`. Sass `silenceDeprecations` from `config/sass.json` applies as in heft. Static assets are served as dev server URLs. `fast-serve` keeps `temp/sass-ts` and `temp/static-asset-ts` typings up to date exactly as `heft build` would, so new style classes and assets are typed without a build.

## Behavior

### Project styles

- `.module.scss`, `.scss` and `.css` are compiled by Vite (Sass for SCSS). CSS modules get SPFx-style names, `<local>_<8-character hash>`, and camelCase locals, so `styles.helloWorld` works as with heft.
- `~` prefixes in Sass imports (`@import '~@fluentui/...'`) work, as with webpack's Sass loader.
- CSS source maps are on.
- **Sass deprecations**: `silenceDeprecations` from `config/sass.json`, merged through `extends` with the SPFx rig (whose default silences `mixed-decls`, `import`, `global-builtin` and `color-functions`), is passed to Vite's Sass compile like in heft, so for example the `@import` warnings of Fluent UI's `References.scss` aren't printed. Without the setting nothing is silenced. The other `config/sass.json` settings are used only for the typings. Editing the project's `config/sass.json` restarts the dev server.
- Style edits hot-swap without re-rendering (see [HMR and Fast Refresh](hmr-and-fast-refresh.md)).

### Theme tokens

- `"[theme:themePrimary, default: #0078d4]"` tokens resolve to the page theme (`window.__themeState__.theme`) whenever a stylesheet is inserted or hot-updated; the token's default is used when the theme has no such slot, and `inherit` when there is no default either.
- The theme is not watched: switching the site theme while the page is open doesn't recolor styles until a reload.

### Library styles (`.module.scss.css`)

- Some SPFx libraries (for example `@pnp/spfx-controls-react`) import `./X.module.scss` but ship only `X.module.scss.css`: Sass output with CSS modules not yet applied, containing `:global(...)` selectors, ICSS `:export {}` values read by JavaScript, and theme tokens.
- Such imports resolve to a module compiled by the project's `@microsoft/sp-css-loader` (found directly or through `@microsoft/spfx-heft-plugins`), with SPFx class-name hashing, `:global` and `:export` support and theme tokens, matching the heft bundle. This works both for dependencies Vite serves directly and for pre-bundled ones.
- If `@microsoft/sp-css-loader` can't be found, the error says it ships with `@microsoft/spfx-heft-plugins` and asks to reinstall the project dependencies.

### Sass typings

- `temp/sass-ts/**/*.d.ts` are produced with heft's own Sass processor (`@rushstack/heft-sass-plugin`, resolved through the project and its SPFx rig) and the project's rig-aware `config/sass.json`, so they are byte-identical to `heft build`.
- Generated as soon as the server starts listening, then on SCSS add, change and unlink. Problems are warnings (`SCSS typings are not generated: …`), never fatal.

### Static assets

- `import logo from './assets/logo.png'` (or `require('./assets/logo.png')`) gives an absolute dev server URL such as `https://localhost:4321/src/webparts/hello/assets/logo.png`. JSON imports give the parsed object.
- `temp/static-asset-ts/**/*.d.ts` follow the rig's `config/static-asset-typings.json` (by default `.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`), byte-identical to heft's `static-asset-typings` task. Written at start and when an asset is added, removed on unlink. The rig's `tsconfig` reads them through `rootDirs`.
- Other extensions (`.woff`, `.mp4`) need a project declaration (`declare module '*.mp4' { const url: string; export default url; }`), exactly as `heft build` needs it.
- Generated typings only cover relative imports (through `rootDirs`). To type assets imported through a tsconfig `paths` alias, add the typings folder as a second target, e.g. `"@assets/*": ["./src/assets/*", "./temp/static-asset-ts/assets/*"]`; `fast-serve` resolves the first target that exists.

## Implementation Notes

- The styles component configures Vite's CSS modules naming, the `~` import handling and the library CSS compilation; the themed-styles browser runtime replaces Vite's style-insertion helper so Vite still owns the `<style>` tags (CSS HMR) while tokens are resolved at insert time.
- Library CSS compilation runs in both the normal pipeline and dependency pre-bundling (as a filtered Rolldown plugin). See [Source pipeline](../architecture/source-pipeline.md).
- Typings generation reuses heft's own logic from the project's toolchain rather than reimplementing it, which is what guarantees identical output.

## Edge Cases

- `@pnp/spfx-property-controls` 3.13 ships CSS that is already hashed; handling it was cut.
- Only the files `fast-serve` writes in `temp/` are typings; it produces no `lib/` or `dist/` output.

## Links

- [Styles, localization and assets in SPFx](../concepts/styles-localization-assets.md)
- [Source pipeline](../architecture/source-pipeline.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [TypeScript source compatibility](typescript-compatibility.md)
- [Scope cuts and features dropped on purpose](../decisions/scope-cuts.md)

## Evidence

- Source: user docs, library SCSS research (all 64 PnP `.module.scss.css` files compared with the heft bundle), project handoff notes, implementation behavior (styles and assets components, themed-styles runtime); verified live during acceptance (theme tokens, SCSS swap, PnP controls)
- Confidence: high
- Last checked: 2026-11-18
