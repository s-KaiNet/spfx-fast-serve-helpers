# 01 — Build pipeline (Heft + SPFx rig)

## Entry points

`package.json` scripts:

| Script | Command | Meaning |
|---|---|---|
| `npm start` | `heft start --clean` | alias → `heft build-watch --serve` (see `aliasesByName.start` in rig `heft.json`) |
| `npm run build` | `heft test --clean --production && heft package-solution --production` | build + jest, then `.sppkg` |
| `npm run eject-webpack` | `heft eject-webpack` | writes a standalone `webpack.config.js` (not executed in this research) |

`config/rig.json` → `"rigPackageName": "@microsoft/spfx-web-build-rig"`. Heft resolves **all** config (heft.json, typescript.json, sass.json, jest config, tsconfig base) from
`node_modules/@microsoft/spfx-web-build-rig/profiles/default/` unless the project overrides a file in `config/`.

Versions (from `spfx-web-build-rig/package.json`): heft 1.3.2, heft-typescript-plugin 1.3.24, heft-sass-plugin 1.5.0, heft-webpack5-plugin 1.3.30, heft-lint-plugin 1.3.1, heft-jest-plugin 2.0.19, heft-dev-cert-plugin 1.1.30, webpack 5.105.4, `@microsoft/spfx-heft-plugins` 1.24.1. The project itself pins TypeScript ~5.8 (log: *Using TypeScript version 5.8.3* — "Resolved typescript as a direct devDependency of the project").

## Phases and tasks (rig `heft.json`)

```
phase build
  set-browserslist-ignore-old-data-env-var   (heft set-environment-variables-plugin; BROWSERSLIST_IGNORE_OLD_DATA=1)
  sass                     ← depends on set-browserslist…           (@rushstack/heft-sass-plugin)
  static-asset-typings                                             (heft-static-asset-typings-plugin: *.png etc → .d.ts)
  typescript               ← depends on sass, static-asset-typings  (@rushstack/heft-typescript-plugin)
  lint                     ← depends on typescript                  (@rushstack/heft-lint-plugin, SARIF → release/analysis-logs/lint.sarif)
  copy-javascript                                                  (copy src/**/*.js → lib/, lib-commonjs/)
  configure-webpack                       (spfx-heft-plugins: spfx-webpack-configuration-plugin)         ┐ hook-only tasks:
  third-party-externals-configure-webpack ← configure-webpack (spfx: third-party-externals-plugin)      │ they tap into the
  configure-webpack-serve                 (spfx: spfx-webpack-serve-configuration-plugin)               │ webpack5 plugin's hooks;
  customize-configure-webpack             (spfx: customize-spfx-webpack-configuration-plugin)           │ log shows "Task execution
  webpack-patch            ← customize…, third-party…           (spfx: webpack-patch-plugin)           ┘ skipped, no implementation"
  webpack                  ← webpack-patch, typescript, sass, copy-javascript   (@rushstack/heft-webpack5-plugin)
  copilot-agent            ← webpack  (spfx: copilot-agent-plugin; skipped: "No config/copilot-agent.json found")
phase test        ← build      jest (heft-jest-plugin) over lib-commonjs/**/*.test.js
phase package-solution         spfx: package-solution-plugin
phase deploy-azure-storage     spfx: deploy-azure-storage-plugin
phase dev-deploy               spfx: spfx-dev-deploy-plugin
phase eject-webpack            spfx: spfx-eject-webpack-configuration-plugin
phase trust-dev-cert / untrust-dev-cert   heft-dev-cert-plugin
```

`cleanFiles` of `build`: `dist lib lib-commonjs lib-dts lib-esm release`, generated `src/**/*.{resx,scss}.{ts,d.ts}`, `temp/{generated-code,loc-ts,sass-ts,static-asset-ts,*.json,*.md}`.

### How the SPFx plugins get into webpack (important for replacement)

`@rushstack/heft-webpack5-plugin` exposes an accessor with hooks (`Webpack5Plugin.js`):

| Hook | Type | Who taps |
|---|---|---|
| `onLoadConfiguration` | `AsyncSeriesBailHook` | SPFx `WebpackConfigurationPlugin` (default stage 0) **returns the generated config**. The built-in "load `webpack.config.js` from project" tap is at stage `1000` → because the hook *bails* on the first non-undefined value, **a local `webpack.config.js` is ignored while the SPFx plugin is active**. |
| `onConfigure` | `AsyncSeriesHook` | `ThirdPartyExternalsPlugin` (stage MAX), `CustomizeWebpackConfigurationPlugin` (stage MAX; runs `config/spfx-customize-webpack.js`), `WebpackPatchPlugin` (stage MAX‑1000; runs files listed in `config/webpack-patch.json`), `WebpackServeConfigurationPlugin` (only in watch+serve) |
| `onAfterConfigure`, `onEmitStats` | | (unused by SPFx) |

So the SPFx tasks in heft.json are "hook registrations"; the real work happens inside the single `webpack` task.

## What each step produces (observed, `heft build --clean`)

| Step | Input | Output |
|---|---|---|
| sass | `src/**/*.module.scss` | `lib/**/X.module.scss.css` (+`.css.map`, also `lib-commonjs/`) — *plain* CSS, `:export`/ICSS preserved (`preserveIcssExports:true`), class names **not** hashed here; typings `temp/sass-ts/**/X.module.scss.d.ts` |
| static-asset-typings | `src/**/*.{png,jpg,svg,…}` | `temp/static-asset-ts/**/X.png.d.ts` (`declare const content: string; export default content;`) |
| typescript | `src/**/*.ts(x)` with `rootDirs: [src, temp/loc-ts, temp/sass-ts, temp/static-asset-ts]` | `lib/**` (**module esnext, target es5**, `importHelpers` → `tslib`, `jsx: react` → `React.createElement`), `.d.ts`, maps; `lib-commonjs/**` (additional CJS emit for jest); static assets copied (`.json .png .resx …` + `webparts/*/loc/*.js`) |
| copy-javascript | `src/**/*.js` (loc strings) | `lib/`, `lib-commonjs/` |
| lint | lib program | `release/analysis-logs/lint.sarif` |
| webpack | `lib/webparts/helloWorld/HelloWorldWebPart.js` | `dist/hello-world-web-part.js` (+map), `dist/HelloWorldWebPartStrings_en-us.js`, `dist/welcome-*_<hash>.png`, `dist/<id>.manifest.json`; `release/assets/*` + `release/manifests/*` (CopyReleaseAssetsPlugin); `release/component-dependency-audit/spfx-rea.json`; `temp/build/manifests.js` |

Note the TS output keeps `import styles from './HelloWorld.module.scss'` — webpack resolves it to `HelloWorld.module.scss.css` because `.css` is in `resolve.extensions`. Same for images: `import welcomeDark from '../assets/welcome-dark.png'` resolves to the copied PNG in `lib/`.

Timings (dev, cold, `--verbose` log): sass 88 ms, static-asset-typings 51 ms, typescript 2.6 s (1583 files parsed), lint 1.3 s, webpack 2.0 s; total ≈ 5.1 s. Production build+test+package ≈ 6.9 s wall.

## Folder map

```
src/            sources (TS/TSX/SCSS/loc .js/assets/manifest.json)
lib/            TS ESM output + compiled .css + copied assets       ← webpack input
lib-commonjs/   CJS output for jest
temp/sass-ts, temp/static-asset-ts   generated .d.ts for TS
temp/build/manifests.js              cumulative debug manifests (AMD)
dist/           webpack output (dev manifests point to https://localhost:4321/dist/)
release/assets, release/manifests    copies for packaging (release manifests point to write-manifests.json cdnBasePath)
release/component-dependency-audit/  which components the bundle depends on (direct/transitive)
sharepoint/solution/                 package-solution output (.sppkg + debug/ unzipped xml)
```

## Production differences (`--production`)

- `mode: production`, `usedExports: true`, minifier `ModuleMinifierPlugin` + `WorkerPoolMinifier` (terser, 3 passes, ≤8 threads), `devtool` none (or `hidden-source-map` if `buildSourceMaps`), `.map` not copied to release.
- Filenames get `_[contenthash]` (`hello-world-web-part_0f2c7c40b28665502f99.js`); loc file gets an md5 hash (`HelloWorldWebPartStrings_en-us_3bd8…js`); `.LICENSE.txt` extracted.
- `source-map-loader` rule removed; `DefinePlugin DEBUG=false`, `NODE_ENV="production"`.
- `package-solution` only includes assets when `includeClientSideAssets` **and** production.
