# A Vite extension point for fast-serve (`config/fast-serve.config.mts`)

> **Implemented** (2026-11-19) with the user's decisions: the file is `fast-serve/vite.extend.mts` (all fast-serve files in `fast-serve/`, options in `fast-serve/config.json`), guards only warn, the skill ships in the package without an install command, and the startup hint is static without a define-key checklist. Current docs: [research/vite-config.md](../vite-config.md).

Discovery only, 2026-11-19. SPFx 1.24.1, Vite 8.3.8, fast-serve `1.24.0-beta.0` tarball. Prototype in `/var/tmp/vext-research` (a copy of `spfx-rea`, port 4403); only the installed package copy there was patched. Nothing in `src/` or the test projects changed.

Legend: **[V]** verified (run/observed), **[C]** read in code, **[I]** inferred.

Follows [research/webpack-customization](../webpack-customization/README.md), which recommended running heft's webpack customization and translating it. The user prefers the classic approach instead: an extra config the project maintains for fast-serve (like classic `fast-serve/webpack.extend.js`), plus docs and an agent skill so coding agents write the Vite counterpart of a webpack customization.

## TL;DR

- **File:** `config/fast-serve.config.mts` (also `.ts`, `.mjs`, `.js`, `.cjs`), next to `config/fast-serve.json` and heft's `config/spfx-customize-webpack.js` / `config/webpack-patch/`. Optional: without it nothing changes.
- **Format:** a plain Vite `UserConfig`, or `defineConfig((context, env) => UserConfig)` (sync or async). `context` = `{ root, port, origin, locale, serveConfiguration, pageUrl, spfxVersion, fastServeVersion, viteVersion }`. To change fast-serve's final config, users add a normal Vite plugin with a `config()` hook; there is no separate "mutate" API.
- **Loading:** fast-serve passes the file to Vite as `configFile` (today `configFile: false`). Vite bundles TS/ESM/CJS, follows local imports, merges it, adds its `plugins`, and **restarts the server when the file or any local file it imports changes**. No jiti, no own loader. Startup overhead is within noise (≈20 ms) **[V]** (the webpack translation in the previous research cost ≈650 ms).
- **Guard rails:** fast-serve's own plugin `config()` results are merged *over* the user file, so protected keys (port, origin, https, appType, base, css.modules, `DEBUG`/`NODE_ENV` defines) are kept automatically **[C/V]**. A guard plugin warns once per (re)start when the file sets one (`"server.port" is ignored (use --port …)`) and when a user plugin changes one after fast-serve (`a plugin … changed "server.origin"`) **[V]**.
- **Public surface:** `exports["."]` with `defineConfig` (runtime, 5 lines) and types `FastServeConfig`, `FastServeContext` and re-exported `UserConfig`/`Plugin`/`ConfigEnv` from Vite (so pnpm projects get types without depending on `vite`). Typechecks with the project's TS **[V]**.
- **Teaching agents:** ship a skill in the npm package (`skills/fast-serve-vite-config/SKILL.md`, draft: [agent-guide-draft.md](agent-guide-draft.md)), a human doc (`vite-config.md`) linked from the README, and a **startup hint**: when a heft webpack customization exists and there's no `fast-serve.config.*`, fast-serve prints the files, the features it uses and the `DefinePlugin` keys as a checklist, plus the doc and skill paths (cheap static scan, no webpack run) **[V]**.
- **User's case, end to end [V]:** `CONTOSO_*` defined from the same `scripts/helpers` (rendered in the web part on the tenant), `@src` → `src` without tsconfig `paths`, an extra user plugin active, editing `scripts/helpers.js` restarted the server and the open SharePoint page reloaded with the new value.
- **Effort: M, ≈2.5 days.** It changes the "no public Vite API" decision: frame it as an **escape hatch**, documented but owned by the user, tied to the Vite major that the package ships.

## 1. Classic spfx-fast-serve, for comparison

`git show ee3b60b^:src/templates/webpack.extend.js`, `src/webpack/configureWebPack.ts` **[C]**:

- `fast-serve webpack extend` created `fast-serve/webpack.extend.js` exporting `{ webpackConfig, transformConfig }`; fast-serve ran `merge(transformConfig(config, webpack), webpackConfig)` (webpack-merge) over its **own** dev config. gulp's `build.configureWebpack` customizations were never applied automatically; users repeated the dev-relevant parts there.
- The new design keeps that model (a second, dev-only file the project owns) but in Vite terms. The two pieces map directly: `webpackConfig` (merged object) → the exported `UserConfig`; `transformConfig` (mutate the full config) → a Vite plugin `config()` hook.

## 2. Extension point design

### 2.1 File name and location

| Option | Verdict |
|---|---|
| **`config/fast-serve.config.mts`** (+ `.ts/.mjs/.js/.cjs`, first found wins) | **recommended.** All SPFx/heft config lives in `config/`; sits next to `fast-serve.json` and the webpack customization it mirrors. `config/` is outside the rig tsconfig `include` (`src/**/*.ts(x)` only) **[V]**, so heft's TypeScript and ESLint don't touch it |
| `fast-serve/vite.extend.mjs` (classic folder) | rejected: the new package has no `fast-serve/` folder; a new top-level folder for one file |
| `vite.config.ts` in the root | rejected: suggests a normal Vite project (`npx vite` would try to run it); IDE Vite extensions pick it up |
| options inside `config/fast-serve.json` | not possible for functions/plugins (JSON) |

`.mts` vs `.ts`: SPFx projects have no `"type": "module"` (CJS). With `.ts`, Vite 8's bundle loader still works, but it prints a warning that `configLoader: 'native'` (planned default) won't parse ESM in a CJS-scoped file **[V]**. With `.mts` the warning only asks for explicit extensions on relative imports (`'../scripts/helpers.js'`); with those, no warning **[V]**. So docs and the template use `.mts`; `.ts` stays accepted. fast-serve should pin `configLoader: 'bundle'` explicitly (it's the current default) so a future Vite default doesn't change behavior silently **[I]**.

### 2.2 Format

```ts
import { defineConfig } from 'spfx-fast-serve-helpers';

export default defineConfig(({ root, port, serveConfiguration }, env) => ({
  define: { … },
  resolve: { alias: { … } },
  plugins: [ … ],
}));
```

- Accepted exports (all Vite-native, so agents already know them): an object, a function (Vite calls it with `ConfigEnv`), a promise. `defineConfig(fn)` wraps `fn` so it gets the **fast-serve context first** and Vite's `env` second.
- How the context reaches the function: fast-serve publishes a frozen object under `globalThis[Symbol.for('spfx-fast-serve-helpers.context')]` before `createServer`; `defineConfig` reads it when Vite calls the wrapper **[V]**. Bundled configs externalize `node_modules` imports, so `spfx-fast-serve-helpers` resolves to the installed package; the `Symbol.for` key also works across duplicate copies **[C/I]**. Outside fast-serve, calling the wrapper throws "fast-serve.config is loaded by the fast-serve command only".
- Considered: a `(config, context) => config | void` mutator. Not needed as API: a plugin `{ name, enforce: 'post', config(config) { … } }` does exactly that and is standard Vite. The docs show it as the "advanced" pattern.
- Not in scope: moving `fast-serve.json` options into this file. Options keep one place and one precedence (CLI > `fast-serve.json` > `serve.json`).

`context` (prototype; all values are already in `ResolvedOptions`/the project model):

| field | from |
|---|---|
| `root` | project root |
| `port`, `origin` | resolved options |
| `locale`, `pageUrl` | resolved options |
| `serveConfiguration` | selected `serve.json` configuration name (`--config`) |
| `spfxVersion` | installed SPFx version (`findSpfxVersion`) |
| `fastServeVersion`, `viteVersion` | package version, `vite.version` (lets a config branch on a Vite major) |

### 2.3 Loading: Vite `configFile` vs own loader

| | **A. `configFile: <file>` (recommended, prototyped)** | B. own `loadConfigFromFile()` call |
|---|---|---|
| TS/ESM/CJS | Vite bundles it with Rolldown (`bundleConfigFile`), local imports inlined, `node_modules` external **[C/V]** | same function, called by fast-serve; its first argument is passed to an exported function, so context could be passed without a global **[C]** |
| restart on change | built in: the file and `configFileDependencies` are watched (also outside the root) and trigger `restartServerWithUrls`, which re-reads the file **[C/V]** | ours. `server.restart()` reuses `inlineConfig` (incl. plugin instances), so a re-loaded user config needs a full close + `startDevServer` again **[C]** |
| merge | `mergeConfig(fileConfig, inlineConfig)`, then plugin `config()` hooks merge over it **[C]** | ours (`mergeConfig`) |
| user plugins | added to the plugin list (file plugins first, then fast-serve's; sorted by `enforce`) **[C]** | must be passed in `plugins` before `createServer` (plugins returned from a `config()` hook are ignored: Vite flattens plugins before running hooks **[C]**) |
| code | ≈30 lines | ≈100 lines + restart orchestration |

A wins. Two gaps found in the prototype:
- **adding or deleting** the file while the server runs: Vite only knows the path it started with. Deleting it failed the restart (`Cannot resolve entry module`, the old server kept running) **[V]**; adding one is not noticed. Fix: watch `config/fast-serve.config.*` for `add`/`unlink` and do a full restart (close + `startDevServer`) **[I]**.
- a broken config **on restart** keeps the old server and prints Vite's error (good) **[V]**; a broken config **at start** fails with Vite's "failed to load config from …" plus the error; wrap it in a fast-serve message with the file name **[I]**.

Also: Vite already restarts on `.env*` changes in the root (`envDir`) with or without a config file; unchanged **[C]**.

### 2.4 Merge order and guard rails

Order inside Vite's `resolveConfig` **[C]**:

1. inline config from `devServer.ts` (`root`, `configFile`, `customLogger`, `plugins`) merged over the user file: inline wins (`root` can't be changed);
2. plugins sorted `pre` → normal → `post`; within a bucket the user's plugins come **before** fast-serve's;
3. each plugin's `config()` result is merged over the config so far: scalars from later hooks win, arrays concatenate, objects deep-merge. So fast-serve's values (port, origin, https, appType, css.modules, defines) override the user file; the user's arrays add to fast-serve's (`optimizeDeps.include/entries`, `resolve.dedupe`, `server.watch.ignored`, `server.fs.allow`, `css.preprocessorOptions.scss.silenceDeprecations`) **[V for port; C for the rest]**;
4. user plugins with `enforce: 'post'` or a `config: { order: 'post' }` hook run after fast-serve and *can* override anything: caught by the `configResolved` check.

Protected keys (warn: "ignored", with the alternative):

| key | why / alternative |
|---|---|
| `root`, `base`, `appType` | manifests, shims and `server.origin` URLs |
| `server.host`, `server.port`, `server.strictPort`, `server.origin` | `--port` / `"port"` in `config/fast-serve.json` |
| `server.https` | SPFx dev certificate |
| `server.hmr.overlay` | `--no-overlay` / `"overlay"` |
| `css.modules` | SPFx class names (`[local]_[hash]`, camelCase) and theme tokens |
| `define.DEBUG`, `define['process.env.NODE_ENV']` | set by fast-serve |
| `experimental.bundledDev` | not supported (decision) |
| `build` | dev server only; heft builds |

Allowed and expected: `define`, `resolve.alias`, `resolve.extensions/conditions/mainFields`, `plugins`, `server.proxy`, `server.headers`, `optimizeDeps.include/exclude`, `css.preprocessorOptions` (e.g. `additionalData`), `oxc` options other than `tsconfig`, `publicDir`, `envPrefix`.

Implementation in the prototype ([userConfig.js](/var/tmp/vext-research/research-prototype/userConfig.js)): one plugin with `config: { order: 'pre' }` (sees the user values before fast-serve's hooks, warns per protected key; empty objects that Vite creates, like `build: {}` with `rollupOptions: undefined`, don't count **[V]**) and `configResolved: { order: 'post' }` (checks the final `server.port`, `server.origin`, `appType`, `base`, `server.https`). For the real implementation: make the post check an **error** for `origin`/`port`/`https`/`appType`/`base` (the page can't load anyway), warnings for the rest.

Real output **[V]**:

```
[fast-serve] Vite config: config/fast-serve.config.mts
[fast-serve] config/fast-serve.config.mts: "server.port" is ignored (use --port or "port" in config/fast-serve.json)
[fast-serve] ready in 587 ms at https://localhost:4403
…
1:30:13 AM [vite] config/fast-serve.config.mts changed, restarting server...
[fast-serve] a plugin from config/fast-serve.config.mts changed "server.origin" to "https://localhost:9999": fast-serve needs "https://localhost:4403"
```

### 2.5 Interaction with existing features

| feature | interaction |
|---|---|
| `config/fast-serve.json` / CLI options | unchanged and authoritative for port, page URL, locale, serve configuration, overlay. Guard warns when the Vite file tries the same |
| tsconfig `paths` | still resolved by fast-serve (`enforce: 'pre'` resolver). Vite's alias plugin runs before it, so a user alias wins **[C, previous research V]**; both should point at `src` |
| `config/sass.json` | `silenceDeprecations` arrays are concatenated with the user's; `additionalData`, extra `importers` work **[C/I]** |
| `config/config.json` externals | stay the way to add externals; the docs say not to use Vite/Rolldown externals |
| restarts | `config/sass.json` / tsconfig restarts (`server.restart()`) re-read the user file as well (Vite reloads `configFile` on every restart) **[C]**. Editing the file or a helper restarted and reloaded the open page **[V]** |
| dependency pre-bundling | changing plugins/`define`/aliases re-optimizes once ("Re-optimizing dependencies because vite config has changed") **[V]**. A value that changes on every start (`CONTOSO_BUILD_TIME`) doesn't force re-pre-bundling **[V previous research]** |
| `@vitejs/plugin-react` | owned by fast-serve. Users must not add another React plugin (docs + skill) **[I]**. A guard could warn when a plugin named `vite:react-*` appears twice |
| fast-serve features plugins | user plugins run before fast-serve's in the same bucket; a user `resolveId`/`load` for `.svg` or `.txt` therefore wins over Vite's asset handling, which is what the mapping needs **[C/I]** |

### 2.6 Does this contradict "no public Vite plugin API"?

Partly, and the KB decision ([zero-config-cli](../../kb/decisions/zero-config-cli.md)) needs an amendment:

- still true: zero-config by default; no fast-serve Vite plugin export; no user `vite.config` required; fast-serve owns the SPFx contract;
- changes: an **optional** Vite config file is read, and the package gets a tiny public export (`defineConfig` + types).

Trade-off: projects with a webpack customization can't use fast-serve today without hacks (`CONTOSO_*` are `ReferenceError`s **[V previous research]**). Auto-translation (previous research) handles `define`/`alias` but costs ≈650 ms start, depends on heft internals and still can't express Vite plugins (svgr, less, babel macros). The extension point covers everything with ≈30 lines of loading code; the cost is a support surface.

Framing for the README and the decision:
- "**escape hatch**, for things fast-serve can't know (your webpack customization). Anything in it is your code; fast-serve only promises to load it, merge it, protect its own settings and restart on change";
- it is **Vite configuration**, so it follows the Vite major the package ships (`context.viteVersion`; Vite 8 today). Policy: change the Vite major only with a new SPFx minor line of the package and call it out in the release notes;
- fast-serve internals (plugin names, virtual ids, `optimizeDeps` contents) stay private; the docs say not to depend on them.

## 3. Mapping guide (webpack → Vite) and the user's worked example

The full table and pitfalls are in the skill draft: [agent-guide-draft.md](agent-guide-draft.md). Key rules:

- **mirror** what changes program semantics in dev: `DefinePlugin`/`EnvironmentPlugin` → `define`; `resolve.alias` → `resolve.alias` with `lib` → `src`; `ProvidePlugin` → explicit imports; loaders for **file types** (svg-as-component, less, raw text, yaml) → Vite plugins/packages; `devServer.proxy/headers` → `server.*`;
- **already handled**: syntax loaders (`babel-loader` for lit, `?.`/`??`), library CSS as global (fast-serve's split is by `.module.` in the name), tsconfig `paths`, `config.json` externals;
- **not needed in dev**: `output`, `optimization`, `devtool`, `performance`, `stats`, `cache`, analyzers, Terser, Copy, ForkTsChecker;
- source in `src` must stay valid for **both** builds: no `?raw`/`?url` unless webpack has a matching rule.

`define` details (Vite 8 dev) **[V/C]**: user defines are not inlined into source; `/@vite/env` (imported first by `/@vite/client`, which every fast-serve entry imports) assigns them to `globalThis` before component code runs. So values must be standalone expressions (`JSON.stringify(...)`), keys identifiers or member paths; computed values are evaluated at server start and on each restart (the same as `heft start`, which builds the config once).

Worked example. The user's patch file `config/webpack-patch/contoso.js` (stubbed, from the previous research):

```js
const webpack = require(/* the rig's webpack */);
const dayjs = require('dayjs');
const { getApiUrl, getClientId, getEcmUrl, getSolutionVersion } = require('../../scripts/helpers');

module.exports = function (webpackConfig) {
  const dateHash = dayjs().format('YYYYMMDDHHmmss');
  webpackConfig.output.filename = '[name].js';
  webpackConfig.plugins.push(new webpack.DefinePlugin({
    CONTOSO_API: JSON.stringify(getApiUrl()),
    CONTOSO_CLIENT_ID: JSON.stringify(getClientId()),
    CONTOSO_HOST_URL: JSON.stringify(`https://${getEcmUrl()}`),
    CONTOSO_BUILD_TIME: JSON.stringify(dateHash),
    CONTOSO_BUILD_VERSION: JSON.stringify(getSolutionVersion())
  }));
  webpackConfig.resolve.alias['@src'] = path.resolve(__dirname, '../../lib');
  webpackConfig.module.rules.push({ test: /\.js$/, include: [/* @lit, lit, lit-html */], use: 'babel-loader' /* optional chaining etc. */ });
  treatRsuiteCssAsGlobal(webpackConfig);
  return webpackConfig;
};
```

Vite counterpart, `config/fast-serve.config.mts` (the file used in the prototype minus the demo plugin) **[V]**:

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

| webpack line | Vite counterpart | why |
|---|---|---|
| `DefinePlugin({...})` | `define` with the same keys and values | values from the same helpers (CJS `scripts/helpers.js`, which `require`s `config/package-solution.json`; named imports from CJS work in the bundled config) **[V]** |
| `dateHash` | computed in the config function | = server start time, recomputed on restart **[V]** |
| `@src` → `lib` | `@src` → `src` | fast-serve compiles `src` on demand; `lib` is stale or missing and watch-ignored. Not needed at all if tsconfig has `paths: { "@src/*": ["src/*"] }` |
| babel-loader for lit | nothing | modern syntax runs as is; lit 3 untranspiled worked on the tenant **[V previous research]** |
| `treatRsuiteCssAsGlobal` | nothing | rsuite CSS is already global in fast-serve **[V previous research]** |
| `output.filename` | nothing | not used in dev |

## 4. Teaching agents

| Option | What | Verdict |
|---|---|---|
| (a) skill in the npm package | `skills/fast-serve-vite-config/SKILL.md` (+ maybe `references/mapping.md`), `"files": ["lib", "skills"]` | **yes.** Versioned with the package, so the guidance matches the Vite major and fast-serve's guard list. Agents don't scan `node_modules` for skills, so the hint and README point to it, and the README shows how to make it project-visible (copy or symlink into `.agents/skills/` / `.claude/skills/`, or one line in the project's `AGENTS.md`: "for fast-serve's Vite config read `node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md`") |
| (b) docs | README section "Webpack customizations → `config/fast-serve.config.mts`" (short, links) + `vite-config.md` next to `migration.md` (the human version of the skill: format, context, merge rules, protected keys, mapping table, worked example) | **yes** |
| (c) startup hint | if a heft webpack customization exists and no `fast-serve.config.*`: warn with files, used features, `DefinePlugin` keys, doc and skill paths | **yes, static.** Reading the customization files and their relative `require`s with regexes takes ~1 ms; running the script (previous research) costs ≈650 ms and runs user code at start, not worth it for a hint |
| (d) scaffold command | `fast-serve init-config` writing a template (like classic `fast-serve webpack extend`), maybe pre-filled with the detected define keys | later, optional; agents write the file fine from the skill |
| (e) copy-skill command | `fast-serve skill install` copying the skill into `.agents/skills` | later, if users ask |

Prototype hint output (config file removed) **[V]**:

```
[fast-serve] this project customizes heft's webpack config (config/webpack-patch/contoso.js), but fast-serve doesn't run webpack.
[fast-serve]   it uses: DefinePlugin, resolve.alias, module rules / loaders
[fast-serve]   defines to mirror: CONTOSO_API, CONTOSO_CLIENT_ID, CONTOSO_HOST_URL, CONTOSO_BUILD_TIME, CONTOSO_BUILD_VERSION
[fast-serve]   add the dev-relevant parts to config/fast-serve.config.mts: <doc URL>
[fast-serve]   coding agents: node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md
[fast-serve] ready in 433 ms at https://localhost:4403
```

Details: detection = `config/spfx-customize-webpack.js` plus `config/webpack-patch.json` `patchFiles` (rig fallback for `webpack-patch.json` would need `@rushstack/rig-package`, already a dev dependency; project-level only is enough for a hint). The define key list is best-effort (object literal inside `DefinePlugin(`); keys from variables won't show. Once a `fast-serve.config.*` exists the hint is silent; a project that needs nothing in dev adds `export default {}`. Rejected: an mtime "webpack customization newer than fast-serve.config" hint (git checkouts reset mtimes).

## 5. Prototype

Patched copy only: `/var/tmp/vext-research/node_modules/spfx-fast-serve-helpers` (`*.orig` = originals). Copies and diffs in `/var/tmp/vext-research/research-prototype/`:
- `userConfig.js`: `findUserConfigFile`, context publish/read, guard plugin;
- `webpackHint.js`: static detection + hint;
- `index.js`, `index.d.ts`: `defineConfig`, types;
- `devServer.diff`: context, `configFile: userConfigFile ?? false`, guard plugin, hint; `package.json.diff`: `exports["."]`.

Test project changes (in the copy): `config/fast-serve.config.mts`, `config/webpack-patch.json` + `config/webpack-patch/contoso.js`, `scripts/helpers.js` (stubs), `src/common/contosoInfo.ts`, HelloWorld renders `contosoInfo` imported via `@src/...`; **no** tsconfig `paths`, so `@src` resolves only through the Vite config; `config/fast-serve.json` port 4403.

| Check | Result |
|---|---|
| `/@vite/env` | `{"CONTOSO_API": "https://api.contoso.example/v1", "CONTOSO_BUILD_TIME": "20261119012858", "CONTOSO_BUILD_VERSION": "1.0.0.0", …, "DEBUG": true, "process.env.NODE_ENV": "development"}` **[V]** |
| `@src` alias | transformed `HelloWorld.tsx` imports `/src/common/contosoInfo.ts` **[V]** |
| user plugin | `X-Fast-Serve-Extension: demo` response header from a `configureServer` middleware **[V]** |
| protected key in the file (`server.port: 5555`) | warning, server stays on 4403 **[V]** |
| plugin overriding `server.origin` (`enforce: 'post'`) | `configResolved` warning **[V]**; manifests still on 4403 (fast-serve builds them from its options) |
| edit `scripts/helpers.js` (v1 → v2 → v3) | `scripts/helpers.js changed, restarting server...`, new value in `/@vite/env` **[V]** |
| edit the config file | restart + one dependency re-optimization **[V]** |
| delete the config file while running | restart fails, old server keeps serving (gap, §2.3) **[V]** |
| `.ts` in a CJS project | works, Vite prints the native-loader warning; `.mts` + explicit extensions: no warning **[V]** |
| types | `tsc --noEmit --module nodenext --strict --allowJs config/fast-serve.config.mts` passes; middleware params typed from `Plugin` **[V]** |
| startup | `ready in` 427/449/430 ms with the file vs 543/414/409 ms without (noise) **[V]** |
| live, tenant `spfx-rea.aspx`, headless Chrome (view only) | `[vite] connected.`; `#contoso-info` = `api=https://api.contoso.example/v2 client=1111… host=https://ecm.contoso.example built=20261119013028 v=1.0.0.0`; `window.CONTOSO_API` set; after editing helpers to v3 the page reloaded by itself and showed `v3` and a new build time **[V]**. Screenshot: `/var/tmp/vext-research/live-check.png` |
| startup hint without the config file | output in §4 **[V]** |

Everything started was stopped (fast-serve on 4403, Chrome on CDP 9333; `sessionStorage["spfx-debug"]` cleared).

## 6. Implementation plan, effort, tests, risks

Proposed modules (follows §8 of the handoff):
- `userConfig/` (new feature): `findUserConfigFile`, `fastServeContext()` (from `ServeContext` + SPFx version), context publish, guard plugin (pre warnings / post errors), add/unlink watcher → full restart, error wrapping at start;
- `userConfig/webpackHint.ts` or `project/webpackCustomizations.ts` (plain Node detection, no Vite) + the hint print in `devServer.ts`;
- `index.ts` (public entry): `defineConfig`, `FastServeConfig`, `FastServeContext`, `export type { UserConfig, Plugin, ConfigEnv } from 'vite'`; `package.json` `exports["."]` with `types`; `tsconfig.build.json` emits `.d.ts` for the entry;
- `devServer.ts`: `configFile: userConfigFile ?? false`, `configLoader: 'bundle'`; the full-restart path also needs `cli.ts` to swap the server it closes on SIGINT;
- `skills/fast-serve-vite-config/SKILL.md` + `"files"`; `vite-config.md`; README section; migration note (classic `webpack.extend.js` → `config/fast-serve.config.mts`); KB: amend [zero-config-cli](../../kb/decisions/zero-config-cli.md), new feature page.

| Work | Estimate |
|---|---|
| loading, context, `defineConfig`, exports + types | 0.5 d |
| guard plugin, add/unlink restart, start error | 0.5 d |
| webpack hint | 0.25 d |
| tests | 0.5 d |
| skill, doc, README, KB | 0.5 d |
| live acceptance (spfx-rea + a project with a customization) | 0.25 d |
| **total** | **M, ≈2.5 d** |

Tests (vitest, next to code):
- `findUserConfigFile` precedence; `defineConfig` with/without context, object passthrough, async;
- guard: protected keys detected in a raw config (incl. Vite's empty `build`), `configResolved` mismatch → error/warn;
- hint: fixtures with `spfx-customize-webpack.js`, `webpack-patch.json` + a helper `require`, DefinePlugin keys, no customization → nothing, config present → nothing;
- integration: `startDevServer` on `test/fixtures` with a `config/fast-serve.config.mts` (define + alias + plugin), assert `server.config.define`, alias resolution, plugin order, port kept; editing a dependency triggers a restart (watcher event).

Risks:
- **users break the SPFx contract through plugins** (resolveId/transform on fast-serve ids, a second React plugin, CSS plugins). Mitigated by the guard for config keys, the skill's "don't" list and the support framing; not fully preventable;
- **Vite major upgrades break user configs** (plugin API, option renames). Version policy + `context.viteVersion` + release notes;
- **the public entry becomes API**: `defineConfig` and the context fields need compatibility within an SPFx minor line; keep the context small;
- **globalThis context** is implicit plumbing; acceptable (only `defineConfig` reads it, clear error outside fast-serve);
- **Vite's native config loader** becoming the default (warning seen with `.ts`); pin `configLoader: 'bundle'`, template uses `.mts` + extensions;
- **two sources of truth** (webpack script and Vite file) can drift; mitigated by importing the same helpers, the startup hint when the Vite file is missing, and the agent skill. Drift in an existing file isn't detected (rejected mtime check);
- **agents mirror webpack semantics literally** (alias to `lib`, adding babel for lit, `?raw` in `src`): the skill calls these out explicitly.

## 7. Open questions for the user

1. File name: `config/fast-serve.config.mts` OK, or prefer something closer to classic (`config/fast-serve.vite.mts`, `fast-serve/vite.extend.mts`)?
2. Guard strictness: errors (stop) for plugin overrides of port/origin/https/appType/base, warnings for keys set in the file: OK?
3. Skill delivery: in the package only (path printed by the hint), or also a `fast-serve skill install` command that copies it into `.agents/skills/`?
4. Should the hint also run when a `fast-serve.config.*` exists but defines none of the detected `DefinePlugin` keys (a cheap drift check by name)?
