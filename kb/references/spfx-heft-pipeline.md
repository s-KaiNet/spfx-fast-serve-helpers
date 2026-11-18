---
title: SPFx 1.24 Heft pipeline (reverse-engineered)
type: reference
status: current
tags:
  - project-kb
  - reference
  - spfx
  - heft
  - webpack
  - manifests
---

# SPFx 1.24 Heft pipeline (reverse-engineered)

## Summary

How SPFx 1.24.1's Heft toolchain builds, serves and loads components, as reverse-engineered from the shipped `@microsoft/spfx-heft-plugins` 1.24.1 code, `heft build`/`heft start` runs and live observation on a SharePoint Online tenant serving SPFx 1.25.0. These facts define what `fast-serve` has to reproduce and where it deliberately matches heft. Concept-level explanations live in the concept pages; this page keeps the detailed heft-side conclusions.

## Current Knowledge

### Build phases (rig `@microsoft/spfx-web-build-rig`)

- All Heft config (`heft.json`, Sass, TypeScript, static-asset typings, tsconfig base) comes from the rig's `default` profile unless the project overrides a file in `config/`.
- Phase `build` runs: `sass` → `static-asset-typings` → `typescript` (src → `lib/` ESM with `target es5`, `jsx: react`, `importHelpers`, plus `lib-commonjs/` for jest) → `lint` and `copy-javascript` → `webpack`. The SPFx webpack tasks in `heft.json` are only hook registrations; the real work happens inside the single webpack task.
- **Webpack bundles `lib/**/*.js` (TypeScript output), not `src/`.** The TS output keeps `import styles from './X.module.scss'`; webpack finds `X.module.scss.css` because `.css` is in `resolve.extensions`. SPFx libraries on npm (for example `@pnp/spfx-controls-react`) ship exactly this shape.
- The webpack config is **generated in memory** from `config/config.json`; a local `webpack.config.js` is ignored while the SPFx plugin is active. Customization points without eject: `config/spfx-customize-webpack.js` (mutates the config last) and `config/webpack-patch.json` patch files.
- Heft's webpack configuration generator can be called from plain Node with serve mode on and production off: it returns entries and externals in about 0.7 s without a build. Useful for parity checks; `fast-serve` does not use it.
- Cold dev build of the small test project ≈ 5 s (TypeScript 2.6 s, webpack 2.0 s).

### Typings tasks

- `sass` compiles `*.module.scss` to plain CSS in `lib/` (ICSS `:export` kept, class names **not** hashed yet) and writes typings to `temp/sass-ts/**/X.module.scss.d.ts`.
- `static-asset-typings` writes `temp/static-asset-ts/**/X.png.d.ts` (`declare const content: string; export default content;`) for the extensions in the rig's `config/static-asset-typings.json` (`.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`).
- The rig tsconfig reads both folders through `rootDirs`. `fast-serve` writes the same files with heft's own logic (see [Styles, theme tokens and asset typings](../features/styles-and-assets.md)).

### Generated webpack config and bundle format

- One entry per bundle; output is a **named AMD module** `define("<componentId>_<version>", [bare specifiers], factory)` whose `default` export is the component class.
- **Export names:** with several components in one bundle, heft generates an intermediate entry that re-exports each component with `export * as <name>` and sets `loaderConfig.exportName` per component; the names are short generated identifiers (`a`, `b`, …, skipping JavaScript reserved words). `fast-serve` generates the same kind of names.
- `DEBUG` and `process.env.NODE_ENV` are defined; assets and chunks load relative to `document.currentScript`, so one build works from localhost, the CDN or the app catalog.
- Async `import()` of an SPFx component is rewritten to `SPComponentLoader.loadComponentById` — the same mechanism `fast-serve`'s library facades use.
- Production adds content hashes, module-level terser minification, `DEBUG=false`; `.map` files are not copied to `release/`.

### CSS and class-name hashing

- `*.module.css` / `*.module.scss.css` go through `@microsoft/sp-css-loader` as CSS modules; other `.css` files are global. The 1.24 module rule is `/\.module(?:\.scss)?\.css$/i` (SPFx 1.23 treated every non-`.global` style file as a module, see [SPFx 1.23 support](../roadmap/spfx-1-23-support.md)).
- sp-css-loader runs cssnano (calc off), autoprefixer and the PostCSS modules chain, then emits `loadStyles(css, true)` from `@microsoft/load-themed-styles` (bundled, not external) plus `export default { class: "class_<hash>", ...:export values }`.
- **Class name = `<class>_<first 8 hex of HMAC-SHA1(key = absolute CSS file path, data = CSS)>`.** Hashes therefore differ between machines; only agreement between CSS and the JS class map matters. `fast-serve`'s compile of library CSS is byte-identical to heft's bundle.
- Theme tokens (`"[theme:x, default:y]"`) stay in the CSS string and are replaced at runtime by load-themed-styles from `window.__themeState__.theme`.

### Externals

Computed by heft, they become both the AMD `define` dependency list and the manifest's `scriptResources`:

1. every dependency (walked deeply) that ships `dist/<guid>.manifest.json` with a component that is not an assembly — all `@microsoft/sp-*` libraries and third-party SPFx library components;
2. non-standard externals with fixed GUIDs: `react`, `react-dom`, `react-dom/client` (React ≥ 18 only) and `@microsoft/microsoft-graph-client`, versioned by the installed package;
3. `config.json` `localizedResources` keys and `externals` keys.

`tslib` and `@microsoft/load-themed-styles` are bundled. `config.json` `externals` appear in the manifest as `{ "type": "path", "path", "globalName"?, "globalDependencies"? }`: URLs as is, local files copied to `dist/`; `globalName` becomes a RequireJS `shim`.

### Manifests and `manifests.js`

- Emitted manifest = source manifest + `loaderConfig` (`internalModuleBaseUrls`, `entryModuleId` = bundle name, `scriptResources`, optional `exportName`); `"version": "*"` becomes the `package.json` version. Manifest strings of the form `{ "id": "$<loc file>:<key>;" }` are localized at build time; local `iconImageUrl` files are copied as assets. Web parts and ACEs share the same manifest processing; extensions only get Command Set `items` processed.
- `scriptResources` types: `path` (string or `{path, integrity}`, optional `globalName`/`globalDependencies`), `localizedPath` (`paths` per locale + `defaultPath`), `component` (`id`, `version`, optional `failoverPath`/`fallbackVersion`).
- Debug manifests point `internalModuleBaseUrls` at `https://localhost:<port>/dist/`; release manifests at `write-manifests.json` `cdnBasePath`, which packaging replaces with `HTTPS://SPCLIENTSIDEASSETLIBRARY/` (SharePoint maps it to the app catalog's `ClientSideAssets/<solutionId>`).
- `/temp/build/manifests.js` is an anonymous AMD module exposing `getManifests()`. Heft puts **every** discovered manifest in it — own components plus all SPFx packages in `node_modules` — but SharePoint pages discard framework manifests, so only the project's own components matter.

### Localized resources

- `localizedResources` maps a name (e.g. `HelloWorldWebPartStrings`) to `lib/.../loc/{locale}.js`; heft emits `<Name>_<locale>.js` and a `path` (one locale) or `localizedPath` entry.
- Loc file forms heft accepts: plain AMD `define([], function () { return {...}; })`; a TypeScript file containing `define([], …)` works; a TypeScript `export default {...}` **builds but breaks at runtime under RequireJS**; `export = {...}` fails with TS1203. See [Localized strings](../features/localization.md).

### `heft start` (serve)

- `heft start` = `build-watch --serve`: the same build incrementally, with webpack-dev-server on `https://localhost:4321` (Rushstack dev certificate from `~/.rushstack/`), `writeToDisk: true`, CORS `*`, `Access-Control-Allow-Private-Network: true`, and static serving of the **whole project root** plus each SPFx package's `dist/`.
- The injected HMR client cannot apply updates (SPFx code accepts none), so every edit ends in a **full page reload**.
- `serve.json`: `initialPage` (token `{tenantDomain}` from `SPFX_SERVE_TENANT_DOMAIN`), `port`, `https`, `hostname`, `serveConfigurations.<name>` (`pageUrl`, `customActions`, `fieldCustomizers`, `formCustomizer`), selected with `--serve-config`; an unknown name warns and falls back to `default`. The debug query replaces the page URL's own query; with extension parameters heft adds `loadSPFX=true` and **removes `debug`** because list pages fail with both. Nothing in heft's serve is ACE-specific.
- **Heft bugs seen (not ours):** heft 1.24.1 writes port 4321 into the served `manifests.js` even when `serve.json` sets another port (the server listens on the configured port, so no bundle loads); with two web part bundles on a page, heft's auto-reload only fired on the first edit. Restarting `heft start` without `--clean` is no faster.

### Runtime loader facts relied upon

- sp-loader builds **RequireJS 2.3.7** from an embedded string; `waitSeconds` is 90, so a module that never defines fails after 90 s with a load timeout.
- The debug manifests file is loaded through RequireJS as a script; manifests of components that are internal on the page are dropped; the rest win version resolution over deployed versions.
- Version resolution: same major, ≥ requested, highest wins. A 1.24.1 project on the 1.25.0 tenant gets 1.25.0 libraries; asking for a newer version than the tenant has fails with `Cannot find manifest for <id>_<ver>. Store had [...]`, in production too.
- Each component gets a RequireJS `map` from its bare specifiers to `<id>_<version>` module ids, so the same specifier can resolve differently per component; listing a library in `scriptResources` makes the loader load it eagerly before the component's script runs.
- The class is `module.default` (unwrapped up to twice) or the `exportName` property.
- CSP: `script-src` includes `https://localhost:*` and `http://localhost:*` (not `127.0.0.1`) only when the page is requested with the debug query; there is no `connect-src`, `style-src` or `img-src`, so WebSocket HMR, fetches, CSS and images from localhost are unrestricted. `sessionStorage["spfx-debug"]` remembers the debug manifests URL for the tab.
- A native ES module imported from `https://localhost:*` works inside a debug page and can read already-defined SPFx AMD modules — the basis of the whole `fast-serve` design.

### Library components under heft

The consumer's `manifests.js` lists linked libraries' manifests with a base URL under `node_modules/<lib>/dist/`, so heft needs a build or watcher in the library. A generated library project has no `main` in `package.json`, although Microsoft's tutorial requires `"main": "lib/index.js"`. Details and the consequences for `fast-serve` are in [Library components](../roadmap/library-components.md).

## Links

- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [SPFx development loop and what fast-serve replaces](../concepts/spfx-dev-loop.md)
- [Match heft behavior for serve configurations and the debug URL](../decisions/match-heft-serve-behavior.md)
- [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)
- [Vite 8, Oxc and Rolldown facts](vite-oxc-rolldown.md)

## Evidence

- Source: research (reverse engineering of `@microsoft/spfx-heft-plugins` 1.24.1 and sp-loader, `heft build`/`heft start` runs on the SPFx 1.24.1 test project, live observation on the tenant serving 1.25.0), project handoff notes
- Confidence: high (observed or read in shipped code); medium for export-name generation details
- Last checked: 2026-11-18
