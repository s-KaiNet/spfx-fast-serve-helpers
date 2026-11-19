---
name: fast-serve-vite-config
description: Write or update config/fast-serve.config.mts, the Vite counterpart of an SPFx project's heft webpack customization (config/spfx-customize-webpack.js or config/webpack-patch.json patch files), so `fast-serve` (spfx-fast-serve-helpers, Vite dev server for SPFx 1.24+) behaves like `heft start`. Use when fast-serve prints "this project customizes heft's webpack config", when a webpack customization changes, or when the app fails under fast-serve with ReferenceError for a DefinePlugin constant, "Failed to resolve import" for an alias, or an unsupported file type.
---

# Vite config for fast-serve (counterpart of a heft webpack customization)

`fast-serve` serves SPFx components with Vite. It never runs webpack, so anything the project adds to heft's webpack config must be mirrored in `config/fast-serve.config.mts` **for development only**. Heft keeps building production bundles from the webpack customization: never remove or change it.

## Workflow

1. Find the webpack customization: `config/spfx-customize-webpack.js` and every file in `config/webpack-patch.json` → `patchFiles`. Read them **and every local file they `require`** (helpers that compute values).
2. Classify each change with the table below: *mirror*, *already handled by fast-serve*, or *not needed in dev*.
3. Write `config/fast-serve.config.mts` (template below). Import the **same helpers** the webpack script uses instead of copying values, so both stay in sync.
4. Run `npm run serve` (or `npx fast-serve`). The startup output must show `Vite config: config/fast-serve.config.mts` and no `is ignored` warnings for keys you meant to set.
5. Verify in the browser (page with the debug query): constants have values, aliased imports load, styles look as in `heft start`.
6. Tell the user which webpack changes were mirrored, which were skipped and why.

## Template

```ts
import path from 'node:path';
import { defineConfig } from 'spfx-fast-serve-helpers';
import { getApiUrl } from '../scripts/helpers.js';

export default defineConfig(({ root }) => ({
  define: {
    MY_API_URL: JSON.stringify(getApiUrl()),
  },
  resolve: {
    alias: { '@src': path.join(root, 'src') },
  },
  plugins: [],
}));
```

- The file is a normal Vite config (`UserConfig`), merged into fast-serve's own config. `defineConfig(fn)` gives `fn` the fast-serve context: `root`, `port`, `origin`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `viteVersion`. The function may be `async`.
- Use `.mts` (SPFx projects are CommonJS packages; `.ts` is parsed as CJS and Vite warns). Write relative imports **with the extension** (`'../scripts/helpers.js'`). Importing CommonJS helpers with named imports works.
- The file is evaluated when the server starts and again on every restart. fast-serve restarts automatically when this file or any local file it imports changes (also JSON files read by the helpers).

## Mapping: webpack → fast-serve

| webpack customization | In `fast-serve.config.mts` |
|---|---|
| `new webpack.DefinePlugin({ X: JSON.stringify(v) })` | `define: { X: JSON.stringify(v) }`: same keys, same `JSON.stringify` values |
| values computed in the script (build time, version from `package-solution.json`, env-based URLs) | compute them the same way in the config function (evaluated at server start/restart) |
| `DefinePlugin.runtimeValue(fn)` | call `fn()` once in the config function |
| `new webpack.EnvironmentPlugin(['A'])` / `{ A: 'dflt' }` | `define: { 'process.env.A': JSON.stringify(process.env.A ?? 'dflt') }` |
| `resolve.alias['@x'] = path.resolve(..., 'lib/...')` | `resolve.alias: { '@x': path.join(root, 'src/...') }`: **point at `src`, never `lib`** (heft bundles compiled `lib`, fast-serve compiles `src`) |
| `resolve.alias['x$'] = …` (exact match) | `resolve.alias: [{ find: /^x$/, replacement: … }]` |
| alias that tsconfig `paths` already declares | nothing to do: fast-serve resolves tsconfig `paths` to `src` |
| `resolve.modules: [path.resolve('src'), 'node_modules']` | tsconfig `baseUrl`/`paths` (fast-serve reads them) or an alias |
| `new webpack.ProvidePlugin({ $: 'jquery' })` | add explicit `import $ from 'jquery'` to the files (works in both builds); otherwise `@rollup/plugin-inject` in `plugins` |
| `NormalModuleReplacementPlugin` | `resolve.alias` (or a small plugin with `resolveId`) |
| `babel-loader` / `ts-loader` / `source-map-loader` added for syntax (lit, `??`, `?.`, `??=`) | **nothing**: browsers run modern syntax, Vite doesn't down-level in dev |
| babel plugins that change semantics (styled-components, emotion, i18n macros) | a Vite plugin that runs the same Babel plugin (e.g. `vite-plugin-babel`); check it with the user |
| CSS rule edits (library CSS as global, e.g. rsuite) | usually **nothing**: fast-serve treats `*.module.css`/`*.module.scss` as CSS modules and every other `.css` (incl. `node_modules`) as global |
| `.less` rule | `npm i -D less`; Vite compiles `.less` itself |
| SVG as React component (`@svgr/webpack`) | `vite-plugin-svgr` configured to transform plain `*.svg` imports with a default export, matching the webpack rule |
| raw/text rule (`asset/source`, `raw-loader`) for `.txt`/`.md`/`.graphql` | a small plugin that returns `export default <JSON string>` for that extension; don't switch the source to `?raw` (heft would not understand it) |
| `.yaml`/`.graphql` loaders | the matching Vite/Rollup plugin (`@rollup/plugin-yaml`, a graphql loader plugin) |
| `externals` added by the script | `config/config.json` → `externals` (fast-serve and heft both read it); don't add Vite externals |
| `resolve.fallback` / Node polyfills | `vite-plugin-node-polyfills`, or remove the Node dependency |
| `devServer.proxy` / `devServer.headers` | `server.proxy` / `server.headers` |
| `output.*`, `optimization`, `devtool`, `performance`, `stats`, `cache`, `mode`, Terser/Analyzer/ForkTsChecker/Copy plugins | **not needed in dev**: leave them out |

## Don't set (fast-serve owns them; warns and ignores)

`root`, `base`, `appType`, `server.host`/`port`/`strictPort`/`https`/`origin`, `server.hmr.overlay`, `css.modules`, `define.DEBUG`, `define['process.env.NODE_ENV']`, `experimental.bundledDev`, `build`. Port, page URL, locale, serve configuration and overlay are fast-serve options: `config/fast-serve.json` or CLI flags (`--port`, `--config`, `--no-overlay`). Don't add React plugins: fast-serve already runs `@vitejs/plugin-react` with Fast Refresh.

## Pitfalls

- `define` values are JavaScript **expressions as strings**: always `JSON.stringify` strings and objects. In dev, Vite assigns them to `globalThis` (they don't get inlined into the source), so a value must not reference variables, `require` or imports: it's evaluated in the browser on its own.
- Keys must be identifiers or member paths (`X`, `process.env.X`). `typeof window` style keys don't work in dev.
- Don't import webpack or the webpack customization in the Vite config. Share the *values* (helpers), not the webpack objects.
- Keep files that both builds compile (in `src`) unchanged and valid for webpack: no `?raw`/`?url`/`import.meta.glob` unless the webpack config supports them too.
- A plugin `config()` hook can override fast-serve's settings: fast-serve warns when `server.port`, `server.origin`, `https`, `appType` or `base` end up different. Fix the plugin instead of ignoring the warning.
- Plugins that only matter for production (compression, legacy, analyzers) don't belong here.
- If something can't be mirrored, say so to the user instead of changing `src` to work around it.
