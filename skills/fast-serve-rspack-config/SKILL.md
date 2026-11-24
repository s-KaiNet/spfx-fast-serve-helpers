---
name: fast-serve-rspack-config
description: Write or update fast-serve/rspack.extend.mjs, the Rspack counterpart of an SPFx project's heft webpack customization (config/spfx-customize-webpack.js or the patch files of config/webpack-patch.json), so `fast-serve` (spfx-fast-serve-helpers, the Rspack dev server for SPFx 1.23) behaves like `heft start`. Use when fast-serve prints "this project customizes heft's webpack config", when a webpack customization changes, or when the app fails under fast-serve with a ReferenceError for a DefinePlugin constant, "Module not found" for an alias, or an unsupported file type.
---

# Rspack config for fast-serve (counterpart of a heft webpack customization)

`fast-serve` serves SPFx components with its own Rspack config. It never runs heft's webpack config, so anything the project adds to heft's webpack config must be mirrored in `fast-serve/rspack.extend.mjs` **for development only**. Heft keeps building production bundles from the webpack customization: never remove or change it.

Rspack is webpack-compatible: most webpack customizations translate almost 1:1 (`webpack.X` → `rspack.X`, same options).

## Workflow

1. Find the webpack customization: `config/spfx-customize-webpack.js` and every file in `config/webpack-patch.json` → `patchFiles` (e.g. `config/webpack-patch/*.js`). Read them **and every local file they `require`** (helpers that compute values).
2. Classify each change with the table below: *mirror*, *already handled by fast-serve*, or *not needed in dev*.
3. Write `fast-serve/rspack.extend.mjs` (template below). Import the **same helpers** the webpack script uses instead of copying values, so both stay in sync.
4. Run fast-serve (`npm run serve` or `npx fast-serve`). The startup output must show `Rspack config: fast-serve/rspack.extend.mjs` and no `is ignored` warnings for keys you meant to set.
5. Verify in the browser (the SharePoint page with the debug query): constants have values, aliased imports load, styles look as in `heft start`.
6. Tell the user which webpack changes were mirrored, which were skipped and why.

## Template

```js
import path from 'node:path';
import { defineConfig, rspack } from 'spfx-fast-serve-helpers';
import { getApiUrl } from '../config/helpers.js';

export default defineConfig(({ root }) => ({
  plugins: [
    new rspack.DefinePlugin({
      CONTOSO_API: JSON.stringify(getApiUrl()),
    }),
  ],
  resolve: {
    alias: { '@src': path.join(root, 'src') },
  },
}));
```

- The file is a Rspack `Configuration` fragment merged into fast-serve's own config like `webpack-merge`: objects deep-merged, arrays appended (`plugins`, `module.rules`, `resolve.extensions`…), other values replaced. Export an object, a promise, or `defineConfig(fn)`: `fn(context, env)` gets the fast-serve context (`root`, `port`, `origin`, `publicPath`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `rspackVersion`) and `env` (`{ command: 'serve', mode: 'development' }`). It may be `async`.
- Import `rspack` (the same Rspack instance fast-serve uses) and the types (`Configuration`, `RspackPluginInstance`, `RuleSetRule`, `DevServer`, `FastServeContext`…) from `spfx-fast-serve-helpers`; the project doesn't need its own `@rspack/core` dependency. Don't import `webpack`.
- File names, first found wins: `rspack.extend.mjs`, `.mts`, `.js`, `.ts`, `.cjs`, `.cts` in the `fast-serve/` folder. `.mts`/`.ts` work on every supported Node version (fast-serve compiles the file itself) and give type checking. Local imports (helpers, JSON) may be ESM or CommonJS, TypeScript or JavaScript; write relative imports with their extension. Packages from `node_modules` are loaded by Node as usual.
- `devServer` is supported for additions: `proxy`, `headers` (added to fast-serve's CORS headers), `setupMiddlewares` (receives fast-serve's middleware list; prepend or append, don't drop entries).
- The file is evaluated at start and on every restart. fast-serve restarts when this file or any local file it imports changes, and when the file is added or removed. A broken edit is reported and the server keeps running with the previous config; fast-serve restarts once the file loads again. A broken file at start stops fast-serve with the error.

## Mapping: webpack → fast-serve

| webpack customization | In `fast-serve/rspack.extend.mjs` |
|---|---|
| `new webpack.DefinePlugin({ X: JSON.stringify(v) })` | `new rspack.DefinePlugin({ X: JSON.stringify(v) })`: same keys and values |
| values computed in the script (build time, version from `package-solution.json`, env-based URLs) | compute them the same way in the config function (evaluated at server start and restart) |
| `new webpack.EnvironmentPlugin(['A'])` | `new rspack.EnvironmentPlugin(['A'])` |
| `new webpack.ProvidePlugin({ $: 'jquery' })` | `new rspack.ProvidePlugin({ $: 'jquery' })` |
| `new webpack.NormalModuleReplacementPlugin(re, file)` / `IgnorePlugin` / `ContextReplacementPlugin` | same name on `rspack.` |
| `resolve.alias['@x'] = path.resolve(..., 'lib/...')` | `resolve: { alias: { '@x': path.join(root, 'src/...') } }`: **point at `src`, never `lib`** (heft bundles compiled `lib`, fast-serve compiles `src`) |
| `resolve.alias['x$']` (exact match) | the same key with `$` |
| alias that tsconfig `paths` already declares | nothing to do: fast-serve resolves tsconfig `paths` |
| `resolve.modules: [path.resolve('src'), 'node_modules']` | the same `resolve.modules` with `src`, or tsconfig `baseUrl`/`paths` |
| `resolve.fallback` | the same `resolve.fallback` |
| `babel-loader` / `ts-loader` / `source-map-loader` added for syntax (lit decorators, `??`, `?.`, `??=`, class fields) | **nothing**: fast-serve compiles TypeScript with SWC using the tsconfig decorator and class-field settings, and the browsers run ES2020 |
| Babel plugins that change semantics (styled-components, emotion, i18n macros) | a `babel-loader` rule with `enforce: 'post'` (runs on SWC's JavaScript output; the project must have `babel-loader`), or the SWC plugin equivalent; check it with the user |
| a loader rule for a new file type (`.txt`/`.md` as text, `.yaml`, `.graphql`, `.less`) | the same `module.rules` entry; `asset/source` instead of `raw-loader` |
| CSS rule edits (library CSS as global, e.g. rsuite) | can't be mirrored 1:1: like heft 1.23, every `.css`/`.scss`/`.sass` without `.global` in its name is a CSS module, `node_modules` CSS included, through `@microsoft/sp-css-loader`; an extend rule runs on top of fast-serve's, it doesn't replace it. Tell the user (the library's class names are hashed under fast-serve as under the uncustomized heft config) |
| SVG as React component (`@svgr/webpack`) | see Pitfalls: fast-serve's asset rule already handles `.svg` |
| `externals` added by the script | `config/config.json` → `externals` (fast-serve and heft both read it, and fast-serve lists it in the debug manifests) |
| `devServer.proxy` / `devServer.headers` | `devServer.proxy` / `devServer.headers` |
| `ForkTsCheckerWebpackPlugin` (type errors while serving) | **no plugin**: fast-serve type checks in the background with the project's TypeScript by default, with type errors in the error overlay on the page (`"typeCheck": false` / `--no-type-check` turns the check off; `"overlay": false` / `--no-overlay` keeps all errors in the terminal). A `TsCheckerRspackPlugin` in the extend file replaces fast-serve's check |
| `ESLintWebpackPlugin` / `eslint-webpack-plugin` (lint while serving) | **no plugin**: fast-serve lints the files you save with the project's own ESLint and `eslint.config.js` by default (`"lint": true`; `"lint": "full"` adds type-aware rules such as `no-floating-promises`; `"lint": false` or `--no-lint` turns it off). An `ESLintRspackPlugin`/`ESLintWebpackPlugin` in the extend file replaces fast-serve's lint, but it runs inside the compile and delays every hot update |
| `output.*`, `optimization`, `devtool`, `performance`, `stats`, `cache`, `mode`, Terser/Analyzer/Copy plugins | **not needed in dev**: leave them out |

## Serving through a tunnel (TunnelServePlugin)

When the user wants the classic fast-serve tunnel flow (Viva Connections/Teams on mobile, `NgrokServePlugin` in an old `webpack.extend.js`), add `TunnelServePlugin` instead of touching `output.publicPath` or `devServer.client`:

```js
import { defineConfig, TunnelServePlugin } from 'spfx-fast-serve-helpers';

export default defineConfig(() => ({ plugins: [new TunnelServePlugin({ host: 'my-tunnel.example.com' })] }));
```

- `host` is the tunnel's host name only: no `https://`, port or path (otherwise fast-serve warns and stays on localhost). Classic `new NgrokServePlugin({ host })` maps 1:1.
- fast-serve doesn't start the tunnel. The user runs one with a **fixed** host forwarding to `https://localhost:<port>` (Dev Tunnels, a named Cloudflare tunnel or paid ngrok; free ngrok's warning page breaks script loads), sets `config/serve.json` `"hostname": "<host>"`, `"port": 443`, builds a development package (`heft build` and `heft package-solution` without `--production`) and deploys it to the app catalog. The page is opened **without** the debug query.
- With the plugin, the debug-query flow on localhost doesn't work; remove the plugin to go back. The context's `origin`/`publicPath` still describe localhost.
- Tell the user the risks: the dev server is public while the tunnel runs, the development package replaces the deployed app, and it needs a rebuild and redeploy when the host or the manifests change.

## Don't set (fast-serve owns them)

fast-serve ignores these keys and prints a warning naming the alternative: `entry`, `mode`, `context`, `target`, `amd`, `externalsType`, every `output.*` key (SharePoint loads fast-serve's AMD bundles from `https://localhost:<port>/dist/`, or from the tunnel host with `TunnelServePlugin`), `devServer: false`, `devServer.port`/`host`/`server`/`https`/`hot`/`liveReload`/`client`/`webSocketServer`/`devMiddleware`/`allowedHosts`.

Port, page URL, locale, serve configuration and overlay are fast-serve options: `fast-serve/config.json` (`port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay`) or CLI flags (`--port`, `--page-url`, `--locale`, `--config`, `--no-overlay`). The options file is flat (no nested `"serve"` object as in classic spfx-fast-serve); start it with `"$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json"` for editor validation of every option.

Don't add React Refresh, HMR or SWC/TypeScript rules: fast-serve already runs them. Don't redefine `DEBUG` or `process.env.NODE_ENV` (fast-serve defines them). Don't depend on fast-serve's internal plugin or rule order.

## Pitfalls

- `DefinePlugin` values are code: always `JSON.stringify` strings and objects.
- Values are computed when the server starts (and on each restart), like `heft start` builds its webpack config once. A build time is the server start time.
- Aliases point at `src`, not `lib` (or `lib-commonjs`): fast-serve compiles `src` and ignores build output folders.
- Rules are appended to fast-serve's, and in Rspack every matching rule applies. fast-serve already has rules for TypeScript, CSS/SCSS and assets (images, fonts, `.svg` and `*.sprite.svg` as URLs). A second rule for one of those extensions runs on top of fast-serve's and usually fails (for example `@svgr/webpack` on `.svg`). Mirror such a rule only for files fast-serve doesn't handle (a different extension, or `resourceQuery`), and tell the user when a webpack rule replaces one of heft's built-in rules and can't be mirrored 1:1.
- `externals` in the extend file are applied, but fast-serve warns: the debug manifests don't list them, so SharePoint can't load them. Use `config/config.json`.
- Keep files that both builds compile (in `src`) valid for heft's webpack.
- Plugins that only matter for production (compression, analyzers, copy) don't belong here.
- Don't set `cache` or `devtool` from a webpack config: fast-serve keeps a persistent cache in `temp/fast-serve/cache` keyed on the final config, and its error mapping needs its source maps. `cache: false` in the extend file turns the persistent cache off; only do that when asked.
- If something can't be mirrored, say so to the user instead of changing `src` to work around it.
