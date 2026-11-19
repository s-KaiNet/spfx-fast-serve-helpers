---
name: fast-serve-vite-config
description: Write or update fast-serve/vite.extend.mts, the Vite counterpart of an SPFx project's heft webpack customization (config/spfx-customize-webpack.js or the patch files of config/webpack-patch.json), so `fast-serve` (spfx-fast-serve-helpers, the Vite dev server for SPFx 1.24) behaves like `heft start`. Use when fast-serve prints "this project customizes heft's webpack config", when a webpack customization changes, or when the app fails under fast-serve with a ReferenceError for a DefinePlugin constant, "Failed to resolve import" for an alias, or an unsupported file type.
---

# Vite config for fast-serve (counterpart of a heft webpack customization)

`fast-serve` serves SPFx components with Vite. It never runs webpack, so anything the project adds to heft's webpack config must be mirrored in `fast-serve/vite.extend.mts` **for development only**. Heft keeps building production bundles from the webpack customization: never remove or change it.

## Workflow

1. Find the webpack customization: `config/spfx-customize-webpack.js` and every file in `config/webpack-patch.json` → `patchFiles` (e.g. `config/webpack-patch/*.js`). Read them **and every local file they `require`** (helpers that compute values).
2. Classify each change with the table below: *mirror*, *already handled by fast-serve*, or *not needed in dev*.
3. Write `fast-serve/vite.extend.mts` (template below). Import the **same helpers** the webpack script uses instead of copying values, so both stay in sync.
4. Run fast-serve (`npm run serve` or `npx fast-serve`). The startup output must show `Vite config: fast-serve/vite.extend.mts` and no `is ignored` or `overrides fast-serve` warnings for keys you meant to set.
5. Verify in the browser (the SharePoint page with the debug query): constants have values, aliased imports load, styles look as in `heft start`.
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

- The file is a normal Vite config (`UserConfig`) merged into fast-serve's own config. Export an object, or `defineConfig(fn)`: `fn(context, env)` gets the fast-serve context first (`root`, `port`, `origin`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `viteVersion`) and Vite's `ConfigEnv` second. It may be `async`.
- Types come from `spfx-fast-serve-helpers` (`defineConfig`, `FastServeConfig`, `FastServeContext`, `UserConfig`, `Plugin`, `ConfigEnv`); the project doesn't need its own `vite` dependency.
- Use `.mts` (SPFx projects are CommonJS packages; Vite warns about ESM syntax in a `.ts` file there). `.ts`, `.mjs`, `.js` and `.cjs` are accepted too. Write relative imports **with the extension** (`'../scripts/helpers.js'`). Named imports from CommonJS helpers work.
- The file is evaluated when the server starts and again on every restart. fast-serve restarts when this file or any local file it imports changes (also JSON files the helpers read), and when the file is added or deleted while it runs.
- It is Vite configuration: it follows the Vite major that the installed fast-serve ships (`context.viteVersion`).

## Mapping: webpack → fast-serve

| webpack customization | In `fast-serve/vite.extend.mts` |
|---|---|
| `new webpack.DefinePlugin({ X: JSON.stringify(v) })` | `define: { X: JSON.stringify(v) }`: same keys, same `JSON.stringify` values |
| values computed in the script (build time, version from `package-solution.json`, env-based URLs) | compute them the same way in the config function (evaluated at server start and restart) |
| `DefinePlugin.runtimeValue(fn)` | call `fn()` once in the config function |
| `new webpack.EnvironmentPlugin(['A'])` / `{ A: 'dflt' }` | `define: { 'process.env.A': JSON.stringify(process.env.A ?? 'dflt') }` |
| `resolve.alias['@x'] = path.resolve(..., 'lib/...')` | `resolve.alias: { '@x': path.join(root, 'src/...') }`: **point at `src`, never `lib`** (heft bundles compiled `lib`, fast-serve compiles `src`) |
| `resolve.alias['x$'] = …` (exact match) | `resolve.alias: [{ find: /^x$/, replacement: … }]` |
| alias that tsconfig `paths` already declares | nothing to do: fast-serve resolves tsconfig `paths` to `src` |
| `resolve.modules: [path.resolve('src'), 'node_modules']` | tsconfig `baseUrl`/`paths` (fast-serve reads them) or an alias |
| `new webpack.ProvidePlugin({ $: 'jquery' })` | explicit `import $ from 'jquery'` in the files (works in both builds); otherwise `@rollup/plugin-inject` in `plugins` |
| `NormalModuleReplacementPlugin` | `resolve.alias` (or a small plugin with `resolveId`) |
| `babel-loader` / `ts-loader` / `source-map-loader` added for syntax (lit, `??`, `?.`, `??=`) | **nothing**: browsers run modern syntax and Vite doesn't down-level in dev |
| Babel plugins that change semantics (styled-components, emotion, i18n macros) | a Vite plugin that runs the same Babel plugin (e.g. `vite-plugin-babel`); check it with the user |
| CSS rule edits (library CSS as global, e.g. rsuite) | usually **nothing**: fast-serve treats `*.module.css`/`*.module.scss` as CSS modules and every other `.css` (incl. `node_modules`) as global |
| `.less` rule | `npm i -D less`; Vite compiles `.less` itself |
| SVG as React component (`@svgr/webpack`) | `vite-plugin-svgr` configured to transform plain `*.svg` imports with a default export, matching the webpack rule |
| raw/text rule (`asset/source`, `raw-loader`) for `.txt`/`.md`/`.graphql` | a small plugin that returns `export default <JSON string>` for that extension; don't switch the source to `?raw` (heft would not understand it) |
| `.yaml`/`.graphql` loaders | the matching Vite/Rollup plugin (`@rollup/plugin-yaml`, a GraphQL loader plugin) |
| `externals` added by the script | `config/config.json` → `externals` (fast-serve and heft both read it); don't add Vite externals |
| `resolve.fallback` / Node polyfills | `vite-plugin-node-polyfills`, or remove the Node dependency |
| `devServer.proxy` / `devServer.headers` | `server.proxy` / `server.headers` |
| `output.*`, `optimization`, `devtool`, `performance`, `stats`, `cache`, `mode`, Terser/Analyzer/ForkTsChecker/Copy plugins | **not needed in dev**: leave them out |

## Don't set (fast-serve owns them)

fast-serve keeps its own values and prints a warning for each of these keys: `root`, `base`, `appType`, `server.host`/`port`/`strictPort`/`https`/`origin`, `server.hmr.overlay`, `css.modules`, `define.DEBUG`, `define['process.env.NODE_ENV']`, `experimental.bundledDev`, `build`.

Port, page URL, locale, serve configuration and overlay are fast-serve options: `fast-serve/config.json` (`port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay`) or CLI flags (`--port`, `--page-url`, `--locale`, `--config`, `--no-overlay`).

Don't add React plugins: fast-serve already runs `@vitejs/plugin-react` with Fast Refresh. Don't depend on fast-serve's internal plugin names, virtual module ids or `optimizeDeps` contents.

## Pitfalls

- `define` values are JavaScript **expressions as strings**: always `JSON.stringify` strings and objects. In dev, Vite assigns them to `globalThis` before the component code runs (they are not inlined into the source), so a value must not reference variables, `require` or imports: it's evaluated in the browser on its own.
- `define` keys must be identifiers or member paths (`X`, `process.env.X`). `typeof window` style keys don't work in dev.
- Values are computed when the server starts (and on each restart), like `heft start` builds its webpack config once. A build time is the server start time.
- Aliases point at `src`, not `lib` (or `lib-commonjs`): fast-serve compiles `src` on demand and ignores build output folders.
- No Babel for lit or modern syntax: it runs as is.
- Don't import webpack or the webpack customization in the Vite config. Share the *values* (helpers), not the webpack objects.
- Keep files that both builds compile (in `src`) valid for webpack: no `?raw`/`?url`/`import.meta.glob` unless the webpack config supports them too.
- A plugin `config()` hook running after fast-serve (`enforce: 'post'`) can override fast-serve's settings: fast-serve warns when `server.port`, `server.origin`, `server.https`, `appType` or `base` end up different, and the SharePoint page won't load. Fix the plugin instead of ignoring the warning.
- Plugins that only matter for production (compression, legacy, analyzers) don't belong here.
- If something can't be mirrored, say so to the user instead of changing `src` to work around it.
