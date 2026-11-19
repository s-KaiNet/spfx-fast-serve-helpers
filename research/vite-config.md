# Customizing the Vite config: `fast-serve/vite.extend.mts`

`fast-serve` configures Vite itself and never runs webpack. A project that customizes heft's webpack config (`config/spfx-customize-webpack.js`, or `config/webpack-patch.json` with patch files such as `config/webpack-patch/*.js`) mirrors the parts that matter in development in `fast-serve/vite.extend.mts`, the counterpart of the classic spfx-fast-serve `fast-serve/webpack.extend.js`. Heft keeps using the webpack customization for builds: don't change or remove it.

The short version is in the [README](../README.md#customizing-the-vite-config). Coding agents: the package ships the same guidance as a skill, `node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md` ([source](../skills/fast-serve-vite-config/SKILL.md)).

## The file

- Location: `fast-serve/vite.extend.mts` in the project root, next to `fast-serve/config.json`. `.ts`, `.mjs`, `.js` and `.cjs` with the same base name work too (the first found in that order wins). Use `.mts`: SPFx projects are CommonJS packages, and Vite warns about ESM syntax in a `.ts` file there. Write relative imports with the extension (`'../scripts/helpers.js'`); named imports from CommonJS helpers work.
- Export an object (`UserConfig`) or use `defineConfig`:
  ```ts
  import { defineConfig } from 'spfx-fast-serve-helpers';

  export default defineConfig(async ({ root, port, serveConfiguration }, env) => ({
    define: { MY_PORT: JSON.stringify(port) },
  }));
  ```
- `defineConfig(fn)` calls `fn(context, env)`: `env` is Vite's `ConfigEnv` and `context` is

  | field | value |
  |---|---|
  | `root` | project folder |
  | `port`, `origin` | the dev server port and `https://localhost:<port>` |
  | `locale`, `pageUrl` | resolved `fast-serve` options (`pageUrl` with `{tenantDomain}` replaced; `undefined` when no page is configured) |
  | `serveConfiguration` | selected `config/serve.json` configuration name (`--config`), or `undefined` |
  | `spfxVersion` | installed SPFx version |
  | `fastServeVersion`, `viteVersion` | versions of this package and of Vite (to branch on a Vite major) |

- Types: `defineConfig`, `FastServeConfig`, `FastServeContext`, `FastServeConfigFunction`, and Vite's `UserConfig`, `Plugin` and `ConfigEnv`, all from `spfx-fast-serve-helpers` (the project doesn't need a `vite` dependency, also with pnpm).
- Vite loads the file (`configFile`, with `configLoader: 'bundle'`): it bundles it with its local imports and keeps `node_modules` imports external.

## Merging and what `fast-serve` keeps

The file is merged into `fast-serve`'s config: objects deep-merge, arrays are concatenated. Your `plugins`, `resolve.alias`, `define` keys, `server.proxy`/`headers`, `optimizeDeps.include`/`exclude`, `css.preprocessorOptions` and the like are added to `fast-serve`'s. User plugins run before `fast-serve`'s plugins of the same `enforce` group.

`fast-serve`'s own values win for the keys below. Setting them in the file prints a warning (the server keeps working with `fast-serve`'s value):

| key | why / instead |
|---|---|
| `root` | the project folder |
| `base`, `appType` | manifests and shims use absolute URLs from the origin; there is no `index.html` |
| `server.host`, `server.port`, `server.strictPort`, `server.origin` | `--port` or `"port"` in `fast-serve/config.json` |
| `server.https` | the SPFx development certificate |
| `server.hmr.overlay` | `--no-overlay` or `"overlay"` in `fast-serve/config.json` |
| `css.modules` | SPFx class names and theme tokens depend on it |
| `define.DEBUG`, `define['process.env.NODE_ENV']` | set by `fast-serve` |
| `experimental.bundledDev` | not supported |
| `build` | dev server only; heft builds |

Example: `[fast-serve] fast-serve/vite.extend.mts: "server.port" is ignored (use --port or "port" in fast-serve/config.json)`.

A plugin whose `config()` hook runs after `fast-serve` (`enforce: 'post'` or `order: 'post'`) can still change anything. When the final `server.port`, `server.origin`, `server.https`, `appType` or `base` differ from what `fast-serve` needs, it warns: `a plugin from fast-serve/vite.extend.mts overrides fast-serve: "server.origin" is "https://localhost:9999", fast-serve needs "https://localhost:4321" (…)`. The page won't load until the plugin is fixed.

Don't add a React plugin (`fast-serve` runs `@vitejs/plugin-react` with Fast Refresh), don't use Vite/Rolldown externals (use `config/config.json` `externals`), and don't depend on `fast-serve`'s internal plugin names, virtual module ids or `optimizeDeps` contents.

## Restarts and errors

- The file is evaluated when the server starts and on every restart (including the restarts after `config/sass.json` or tsconfig changes). Values computed in it (a build time) are the server start time, like `heft start`, which builds its webpack config once.
- Editing the file or a local file it imports (helpers, JSON they read) restarts the Vite server; the open page reloads.
- Adding or deleting `fast-serve/vite.extend.*` while `fast-serve` runs restarts `fast-serve`. An added file that fails to load is reported and the running server keeps going; it restarts when the file is fixed.
- A broken file at start: `fast-serve` stops with `fast-serve/vite.extend.mts could not be loaded: <error>` (Vite prints the details above it). A broken edit while running keeps the old server and prints Vite's error.
- Changing plugins, `define` or aliases makes Vite re-optimize the pre-bundled dependencies once.

## Mapping webpack to Vite

Mirror what changes program semantics in development; skip what only affects production output.

| webpack customization | `fast-serve/vite.extend.mts` |
|---|---|
| `DefinePlugin({ X: JSON.stringify(v) })` | `define: { X: JSON.stringify(v) }`, values from the same helpers |
| `EnvironmentPlugin(['A'])` | `define: { 'process.env.A': JSON.stringify(process.env.A ?? '') }` |
| `resolve.alias['@x'] = '…/lib/…'` | `resolve.alias: { '@x': path.join(root, 'src/…') }` (`src`, not `lib`). Nothing to do if tsconfig `paths` declares it |
| `ProvidePlugin` | explicit imports in the source, or `@rollup/plugin-inject` |
| `babel-loader` for syntax (lit, `?.`, `??`) | nothing: modern syntax runs as is |
| library CSS as global (e.g. rsuite) | nothing: only `*.module.css`/`*.module.scss` are CSS modules in `fast-serve` |
| loaders for file types (svg as component, less, raw text, yaml) | the matching Vite plugin or package (`vite-plugin-svgr`, `less`, a small `load` plugin, `@rollup/plugin-yaml`); keep the imports in `src` valid for webpack (no `?raw`) |
| `externals` | `config/config.json` `externals` |
| `devServer.proxy` / `headers` | `server.proxy` / `server.headers` |
| `output`, `optimization`, `devtool`, `performance`, `stats`, `cache`, analyzers, Terser, Copy, ForkTsChecker | nothing (not used in development) |

`define` in Vite 8 development: the values are not inlined into the source. Vite assigns them to `globalThis` before the component code runs, so each value must be a standalone expression (`JSON.stringify(...)`), and keys must be identifiers or member paths (`X`, `process.env.X`).

The full table with more cases and the pitfalls is in the [skill](../skills/fast-serve-vite-config/SKILL.md).

## Worked example

A patch file `config/webpack-patch/contoso.js` (listed in `config/webpack-patch.json` `patchFiles`):

```js
const webpack = require('webpack');
const path = require('path');
const dayjs = require('dayjs');
const { getApiUrl, getClientId, getEcmUrl, getSolutionVersion } = require('../../scripts/helpers');

module.exports = function (webpackConfig) {
  webpackConfig.output.filename = '[name].js';
  webpackConfig.plugins.push(new webpack.DefinePlugin({
    CONTOSO_API: JSON.stringify(getApiUrl()),
    CONTOSO_CLIENT_ID: JSON.stringify(getClientId()),
    CONTOSO_HOST_URL: JSON.stringify(`https://${getEcmUrl()}`),
    CONTOSO_BUILD_TIME: JSON.stringify(dayjs().format('YYYYMMDDHHmmss')),
    CONTOSO_BUILD_VERSION: JSON.stringify(getSolutionVersion())
  }));
  webpackConfig.resolve.alias['@src'] = path.resolve(__dirname, '../../lib');
  webpackConfig.module.rules.push({ test: /\.js$/, include: [/lit/], use: 'babel-loader' });
  return webpackConfig;
};
```

`fast-serve/vite.extend.mts`:

```ts
import path from 'node:path';
import dayjs from 'dayjs';
import { defineConfig } from 'spfx-fast-serve-helpers';
import { getApiUrl, getClientId, getEcmUrl, getSolutionVersion } from '../scripts/helpers.js';

export default defineConfig(({ root }) => ({
  define: {
    CONTOSO_API: JSON.stringify(getApiUrl()),
    CONTOSO_CLIENT_ID: JSON.stringify(getClientId()),
    CONTOSO_HOST_URL: JSON.stringify(`https://${getEcmUrl()}`),
    CONTOSO_BUILD_TIME: JSON.stringify(dayjs().format('YYYYMMDDHHmmss')),
    CONTOSO_BUILD_VERSION: JSON.stringify(getSolutionVersion()),
  },
  resolve: {
    alias: { '@src': path.join(root, 'src') },
  },
}));
```

| webpack | Vite | why |
|---|---|---|
| `DefinePlugin` | `define`, same keys and values | computed by the same helpers; editing `scripts/helpers.js` restarts `fast-serve` |
| build time | computed in the config function | the server start time |
| `@src` → `lib` | `@src` → `src` | `fast-serve` compiles `src`; `lib` is build output |
| `babel-loader` for lit | nothing | lit runs untranspiled |
| `output.filename` | nothing | not used in development |

## The startup hint

When the project has `config/spfx-customize-webpack.js` or `config/webpack-patch.json` and no `fast-serve/vite.extend.*`, `fast-serve` prints once at start:

```
[fast-serve] hint: this project customizes heft's webpack config (config/webpack-patch.json, config/webpack-patch/contoso.js), but fast-serve doesn't run webpack.
[fast-serve]   if those customizations matter in development (DefinePlugin constants, aliases, loaders), mirror them in fast-serve/vite.extend.mts:
[fast-serve]   a Vite config that fast-serve merges into its own and reloads on change, for example:
[fast-serve]     import { defineConfig } from 'spfx-fast-serve-helpers';
[fast-serve]     export default defineConfig(({ root }) => ({ define: { MY_CONSTANT: JSON.stringify('value') } }));
[fast-serve]   docs: https://github.com/s-KaiNet/spfx-fast-serve-helpers#customizing-the-vite-config
[fast-serve]   coding agents: node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md
[fast-serve]   to make a project's coding agent use it, add to its AGENTS.md: "For fast-serve's Vite config (fast-serve/vite.extend.mts) follow node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md"
[fast-serve]   nothing to mirror? add fast-serve/vite.extend.mts with "export default {};" to hide this hint
```

The detection is static (file names and `patchFiles`); the webpack customization isn't run. Once the file exists the hint is silent, also when it doesn't mirror everything.

## Coding agents

Agents don't search `node_modules` for skills. Reference the shipped skill from the project's `AGENTS.md` (or `CLAUDE.md`):

```md
- fast-serve (Vite dev server): when the heft webpack customization (config/spfx-customize-webpack.js, config/webpack-patch.json) changes, or for anything in fast-serve/vite.extend.mts, follow node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md.
```

Or copy `skills/fast-serve-vite-config/` into the project's skills folder (`.agents/skills/`, `.claude/skills/`); a copy doesn't follow package updates.

## Compatibility

The file is an escape hatch for what `fast-serve` can't know. Its content is your code: `fast-serve` promises to load it, merge it, keep its own settings and restart on change. It is Vite configuration, tied to the Vite major the package ships (Vite 8 in `1.24.x`); the Vite major changes only with a new SPFx minor line of the package and is called out in the release notes. The public entry is `defineConfig` plus the types above.
