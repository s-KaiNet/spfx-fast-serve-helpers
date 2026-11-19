# Webpack customizations (`spfx-customize-webpack.js`, `webpack-patch.json`) in fast-serve

Discovery only, 2026-11-19. SPFx 1.24.1, `@rushstack/heft-webpack5-plugin` 1.3.30, Vite 8.3.8, fast-serve `1.24.0-beta.0` tarball. Experiments ran in `/var/tmp/wp-research` (a copy of `spfx-rea` plus `rsuite@6`, `lit@3`, `dayjs`, `babel-loader`). Nothing in the repo or the test projects was changed except this file.

Legend: **[V]** verified (run/observed), **[C]** read in code, **[I]** inferred.

## TL;DR

- **Recommendation: (c), mostly (a).** When a project has a heft webpack customization, `fast-serve` runs it against the real SPFx webpack config and translates the dev-relevant parts: `DefinePlugin`/`EnvironmentPlugin` → Vite `define`, `resolve.alias` → Vite aliases (`lib/…` targets rewritten to `src/…`). Everything else is listed once at startup as *ignored* (not needed in dev) or *not supported*. Customization scripts get a documented way to detect fast-serve (`taskSession.taskName === 'fast-serve'` / `process.env.FAST_SERVE`) as the escape hatch. No new config file and no public Vite API, so the "zero-config, no Vite plugin API" decision holds. A declarative `define`/`alias` in `config/fast-serve.json` only if users ask for it.
- **Effort: S–M, about 1.5–2 days** (module + tests + docs + live check). A working prototype (≈260 lines) is in the installed copy.
- **Cost:** ≈0.65 s more startup, **only** for projects that have a customization. Most of it is `require('@microsoft/spfx-heft-plugins')` (≈400 ms) plus the generator (≈260 ms). Projects without one pay nothing.
- With the prototype, the user-like customization works end to end on the tenant **[V]**: `CONTOSO_*` values render, `@src` resolves (to `src/`), rsuite CSS is global, lit runs untranspiled.

## 1. How heft runs webpack customizations (SPFx 1.24)

Two mechanisms, both in the rig's `build` phase (`@microsoft/spfx-web-build-rig/profiles/default/config/heft.json`) **[C]**:

| | `config/spfx-customize-webpack.js` | `config/webpack-patch.json` → `patchFiles` |
|---|---|---|
| Plugin | `customize-spfx-webpack-configuration-plugin` (`CustomizeWebpackConfigurationPlugin.js`) | `webpack-patch-plugin` (`webpackPatchPlugin/WebpackPatchPlugin.js`) |
| File | `<project>/config/<customizationFilename>`, rig option `customizationFilename: "spfx-customize-webpack.js"` (changing it means overriding the rig's `heft.json`) | paths relative to the project root, e.g. `./config/webpack-patch/x.js` (the layout in Microsoft's docs); `webpack-patch.json` is loaded with rig fallback |
| Export | `module.exports = fn` or `exports.default = fn` | the same |
| Signature | `fn(webpackConfig, taskSession, heftConfiguration, webpack)`: `webpack` is the instance heft uses | `fn(webpackConfig)` |
| Sync/async | called **synchronously**, return value ignored, a returned promise is **not awaited** | `await`ed, run in order |
| Return value | ignored, so you must mutate in place | the plugin passes the returned object along, but `onConfigure` is a tapable `AsyncSeriesHook`, which drops tap results, so a *new* object never reaches webpack **[C/I]**. Only in-place changes count (Microsoft's docs say "return the modified config", which works only because it's the same object) |
| Errors | require/throw → `emitError` → the heft build fails | the same, per file |
| Hook / order | `onConfigure`, stage `MAX_SAFE_INTEGER` (last) | `onConfigure`, stage `MAX_SAFE_INTEGER − 1000` (runs **before** `spfx-customize-webpack.js`) |

- Both run in `heft build` and in `heft start` (= `build-watch --serve`): `WebpackConfigurationLoader` calls `onConfigure` for every configuration **[C]**. `heft build --clean` applied the test customization **[V]**: `CONTOSO_*` were inlined in `dist/hello-world-web-part.js`, `@src/common/*` resolved to `lib/common/*.js`, and babel removed every `??=` from the bundled lit code.
- Before the customizations run, the config already contains SPFx's generated config (`WebpackConfigurationGenerator`), the third-party externals (stage MAX) and, in serve mode only, `devServer` (`WebpackServeConfigurationPlugin`, stage 0) **[C]**.
- A local `webpack.config.js` is ignored while the SPFx plugin is active (`onLoadConfiguration` is a bail hook) **[C]**, see [spfx-pipeline/01](../spfx-pipeline/01-build-pipeline.md).
- What the generated config contains that customizations typically touch **[C]** ([spfx-pipeline/02](../spfx-pipeline/02-webpack-config.md)):
  - `module.rules`: `.js` fullySpecified, CSS-module rule `/\.module(?:\.scss)?\.css$/i`, global CSS rule `/(?<!\.module(?:\.scss)?)\.css$/` (both use `sp-css-loader`), assets, `.html`;
  - `resolve.alias` (empty);
  - `plugins` (SPFx's own `DefinePlugin` with `DEBUG`, `DEPRECATED_UNIT_TEST`, `process.env.NODE_ENV`);
  - `externals`, `output`, `optimization`, `devtool`.

The user's paths (`../../lib`, `../../scripts/helpers`) match a file two levels deep, i.e. the documented `config/webpack-patch/<name>.js` layout. **fast-serve must support both mechanisms.**

## 2. Classic spfx-fast-serve (gulp era): `fast-serve/webpack.extend.js`

From `git show ee3b60b^:src/templates/webpack.extend.js` and `src/webpack/configureWebPack.ts` **[C]**:

- `fast-serve webpack extend` created `fast-serve/webpack.extend.js` exporting `{ webpackConfig, transformConfig }`.
- fast-serve built **its own** webpack config (ts-loader from `src`, its own CSS loaders and dev server) and copied only `externals`/`output`/`entry` from SPFx's `temp/_webpack_config.json`. It then ran `merge(transformConfig(config, webpack), webpackConfig)` (webpack-merge).
- So the gulp `build.configureWebpack` customizations were **not** applied automatically. Users had to repeat them (DefinePlugin, aliases, loaders) in `webpack.extend.js`: two sources of truth, but the same tool (webpack) on both sides, so they could copy code over verbatim.
- [kb/decisions/zero-config-cli](../../kb/decisions/zero-config-cli.md) already records "`webpack.extend.js` has no equivalent".

## 3. Which customizations matter in dev, and how they map to Vite

| Webpack customization | Matters in dev? | Vite / fast-serve mapping | Status |
|---|---|---|---|
| `new DefinePlugin({...})` | **yes**: without it `CONTOSO_API` is a `ReferenceError` | Vite `define`. Nested objects flatten to dotted keys; numbers/booleans → `String(v)`; `DefinePlugin.runtimeValue` → call once | **[V]** |
| entries added to SPFx's existing `DefinePlugin.definitions` | yes | same, but needs a before/after diff of `definitions` (the prototype only diffs *new* plugins) | todo **[I]** |
| `EnvironmentPlugin` | yes | `process.env.KEY` defines from `process.env`/defaults | prototype **[V]** (startup output) |
| `resolve.alias` | **yes** | Vite `resolve.alias` (regex `^key(?=/\|$)`, `key$` → exact). Targets under `<root>/lib`, `lib-commonjs`, `lib-esm` → same path under `<root>/src` | **[V]** |
| `ProvidePlugin` | yes, but rare | no Vite equivalent (would need an import-injecting transform); warn "import these names explicitly" | warn |
| `externals` added by script | yes | not translatable in general; warn, point to `config/config.json` `externals` (already supported) | warn |
| `resolve.extensions/modules/fallback/mainFields` | sometimes | warn (Vite has its own defaults; `fallback` = Node polyfills, not provided) | warn |
| extra loaders for **syntax** (`babel-loader` for lit, optional chaining…, `ts-loader`, `source-map-loader`) | **no** | browsers that run SharePoint run ES2021 natively; Vite pre-bundles deps without down-levelling. Lit served untranspiled worked **[V]** | ignore (info) |
| extra loaders for **file types** (`.svg` as React, `.less`, `.graphql`, `.md`…) | yes | no automatic mapping; Vite handles `.less` if `less` is installed, `?raw`/`?url` differ; warn with the rule's `test` | warn |
| CSS rule edits (e.g. rsuite global) | no, in practice | fast-serve: `.module.css`/`.module.scss` = CSS modules, any other `.css` (incl. `node_modules`) = global, the same split as SPFx 1.24's default rules | ignore (info) **[V]** |
| `output.*`, `optimization`, `devtool`, `performance`, `mode`, `cache`, `stats`, `target` | no | n/a | ignore silently or as info |
| `devServer.*` (headers, proxy…) | rarely | not mapped (fast-serve owns the server); could warn for `proxy` | ignore/warn |
| arbitrary plugins (BundleAnalyzer, Copy, ForkTsChecker…) | mostly no | ignore, list names once | warn (list) |

### Notes on the user's customization

- **`DefinePlugin` (`CONTOSO_*`)**: translated. Vite dev doesn't inline user defines into source. It puts them into `/@vite/env` (imported first by `/@vite/client`, which every fast-serve entry imports), which assigns them to **`globalThis`** before any component module runs **[V]** (`window.CONTOSO_API` is set on the page; fast-serve's own `DEBUG` and `process.env.NODE_ENV` already work this way). Consequences:
  - values are evaluated once in the page (`handleDefineValue`: strings are inserted as raw expressions). `JSON.stringify(...)` values are fine. An expression referencing module scope (`'require("x")'`, a local name) would throw inside `/@vite/env` and break the whole client. So accept JSON literals, `undefined`, `true`/`false`/numbers, and warn about (or skip) other expressions **[I]**;
  - globals leak onto the SharePoint page under these names (harmless for `CONTOSO_*`, odd for keys like `typeof window`, which should be skipped).
  - `define` is **not** part of Vite's dependency-optimizer hash (`getConfigHash` hashes only `NODE_ENV`) **[C/V]**. A value that changes each start (`CONTOSO_BUILD_TIME`) doesn't force re-pre-bundling: the second start didn't re-optimize **[V]**. The first start with the customization did re-optimize once, because the alias and plugin list changed the hash.
- **`CONTOSO_BUILD_TIME`** = dev-server start time (`dayjs()` when the script runs), recomputed on every fast-serve restart. `heft start` behaves the same (computed when the config is built) **[I]**. `CONTOSO_BUILD_VERSION` from `package-solution.json` is read at start; the prototype restarts when any local file the script `require`d changes (`scripts/helpers.js`, `config/package-solution.json`) **[V]**.
- **`@src` → `lib`**: heft compiles `src/**/*.ts` to `lib/**/*.js` first and webpack bundles `lib`, so the alias points at `lib`. fast-serve compiles `src` on demand, and `lib` is watch-ignored, possibly stale or missing. So rewrite `<root>/lib|lib-commonjs|lib-esm/<rest>` → `<root>/src/<rest>` and let Vite resolve `.ts/.tsx` **[V]**. Pointing Vite at `lib` would serve old builds without HMR.
  - In practice TypeScript can't type-check `@src/...` imports without a tsconfig `paths` entry (`@src/*` → `src/*`), and fast-serve **already** resolves tsconfig `paths` (to `src`). The tsconfig-paths fallback alone made `@src` work in the experiment **[V]**. Without `paths`, plain fast-serve fails ("Failed to resolve import "@src/common/contosoInfo"") and the translated alias fixes it **[V]**. Vite's alias plugin runs before fast-serve's `enforce: 'pre'` tsconfig resolver, so a translated alias wins; both point at the same `src` file.
- **babel-loader for `@lit`/`lit`/`lit-html`**: a gulp-era workaround (webpack 4's parser couldn't read `?.`/`??`/`??=`). Webpack 5 parses them. In fast-serve, lit 3 (contains `??=`) ran untranspiled on the tenant **[V]**. Ignored with an info line. Side note: SPFx's tsconfig `target: es5` turns a TS class extending `LitElement` into an ES5 function, which can't construct custom elements. That's a heft/TS issue, not ours.
- **`treatRsuiteCssAsGlobal`**: with SPFx 1.24's default rules, rsuite's CSS (`rsuite/dist/*.css`, `rsuite/*/styles/index.css`, no `.module.css` in rsuite 6.2.5) **already** matches only the global rule **[C/V]**.
  - A helper that pushes a copy of the global rule for rsuite *without* excluding rsuite from the original global rule makes webpack run `sp-css-loader` twice on the file. `heft build` then fails with `Module build failed … SyntaxError > 1 | // Imports` **[V]** (my first stub did exactly that; adding the exclude fixed it). Worth asking the user how their helper finds the rules: it may be a no-op leftover from the gulp era.
  - fast-serve serves `rsuite-no-reset.min.css` as global CSS (`.rs-btn` unhashed, no class-map export) without any customization **[V]**, and the button was styled on the tenant **[V]**.
- **`output.filename = '[name].js'`**: irrelevant in dev (and already SPFx's dev default).

## 4. Options

### (a) Run the heft customization and translate (auto)

How: if `config/spfx-customize-webpack.js` or `config/webpack-patch.json` exists:

1. generate SPFx's webpack config in Node: `WebpackConfigurationGenerator.generateWebpackConfigurationAsync({ serveMode: true, production: false, … })` from the project's `@microsoft/spfx-heft-plugins` (a public export; `_readConfigFileAsync` for `config.json` is underscore-internal, but fast-serve already has its own config.json reader);
2. snapshot plugins, rules, alias, resolve, externals and the dev-irrelevant keys;
3. run the patch files (awaited, in order), then `spfx-customize-webpack.js` with `(config, taskSessionStub, heftConfigurationStub, webpack)`. `webpack` comes from `@microsoft/spfx-heft-plugins`, the same instance as the rig's (`require.resolve` gives the same path in the npm project **[V]**), so `instanceof DefinePlugin` works, with a constructor-name fallback;
4. diff and translate (§3); print a short report; watch the script and every local file it `require`d and restart on change (clear those `require.cache` entries before re-running).

| | |
|---|---|
| UX | zero config, **one source of truth** with heft. The user's file works unchanged. Startup prints what was applied, ignored and unsupported |
| Robustness | real SPFx rules and plugins are present, so scripts that `find()` SPFx rules and `throw` if they're missing (like the user's) work. Gaps: `devServer` and the third-party externals are missing in the generated config (heft adds them in serve mode / through another plugin). A script touching `config.devServer.headers` threw in the prototype **[V]**. Fix: seed `devServer: {}` (and optionally run `ThirdPartyExternalsPlugin`'s logic). A failing script is reported as a warning and the server still starts with what was translated (heft would fail the build) |
| Cost | +≈650 ms startup only with a customization (`require` spfx-heft-plugins ≈400 ms, `config.json` read ≈60 ms, generator ≈260 ms, script ≈3 ms) **[V]**. A skeleton config (just `webpack`, ≈80 ms) would be faster but breaks scripts that inspect SPFx's rules/plugins: not worth it |
| Maintenance | depends on heft's generator signature (public, stable since 1.22; fast-serve already pins SPFx `major.minor`) and on webpack plugin internals (`DefinePlugin.definitions`, `ProvidePlugin.definitions`, `EnvironmentPlugin.keys/defaultValues`), which have been stable for years |
| Risks | runs user code at dev-server start (it runs in heft anyway); the script's side effects (writing files, reading env/secrets) happen on every start; arbitrary define expressions in `/@vite/env` (validate) |

### (b) A fast-serve extension point

- **b1. `config/fast-serve.js`** returning a partial Vite config (or `{ define, alias, plugins }`): maximum power, but it contradicts "no public Vite plugin API". Users with arbitrary Vite plugins can break the exact settings fast-serve depends on (`appType`, `server.origin`, `optimizeDeps.entries`, watch ignores), and Vite major upgrades become breaking changes for users. It also creates a second source of truth (like classic `webpack.extend.js`), and the values must be duplicated (helpers re-imported).
- **b2. Declarative `define` / `alias` in `config/fast-serve.json`**: safe and simple to validate, but static. It can't express `getApiUrl()`, env-based values or `CONTOSO_BUILD_TIME`, which is exactly the user's case. Still duplicates heft.

UX: explicit but duplicated. Maintenance: b1 high, b2 low. Neither helps the user without extra work.

### (c) Combination (recommended)

(a) as the default, plus a light escape hatch that needs no new API:

- `taskSession.taskName === 'fast-serve'` (and/or `process.env.FAST_SERVE === '1'` while the script runs), documented in the README, so a script can branch: skip expensive work, point an alias at `src`, add dev-only defines. That is one file, with heft as the source of truth;
- optionally later, b2 (`define`/`alias` in `fast-serve.json`, merged after the translation) if someone needs dev-only values without touching the heft script.

## 5. What the startup output looks like (prototype, real run)

```
[fast-serve] webpack customization: config/spfx-customize-webpack.js (648 ms)
[fast-serve]   define: CONTOSO_API, CONTOSO_CLIENT_ID, CONTOSO_HOST_URL, CONTOSO_BUILD_TIME, CONTOSO_BUILD_VERSION
[fast-serve]   alias: @src → src (webpack: lib)
[fast-serve]   ignored: edited SPFx rule /\.module(?:\.scss)?\.css$/i (fast-serve: .module.css/.module.scss are CSS modules, other .css is global)
[fast-serve]   ignored: edited SPFx rule /(?<!\.module(?:\.scss)?)\.css$/ (fast-serve: …)
[fast-serve]   ignored: rule /\.js$/ → babel-loader (syntax transpiling is not needed in development)
[fast-serve]   ignored: rule /\.css$/ → sp-css-loader (fast-serve: …)
[fast-serve] ready in 1031 ms at https://localhost:4402
```

With an extra patch file (ProvidePlugin, EnvironmentPlugin, an object external, `config.devServer.headers = …`):

```
[fast-serve] webpack customization: tools/webpack/dev-server-patch.js, config/spfx-customize-webpack.js (651 ms)
[fast-serve]   define: process.env.CONTOSO_ENV, CONTOSO_API, …
[fast-serve]   not supported in fast-serve: ProvidePlugin ($): import these names explicitly
[fast-serve]   not supported in fast-serve: externals ({"my-lib":"MyLib"}): use config/config.json "externals"
[fast-serve]   failed (served without the rest of it): tools/webpack/dev-server-patch.js: Cannot set properties of undefined (setting 'headers')
```

Suggested final wording: one info header, `define`/`alias` lines, the "ignored" items collapsed into one line (or only shown with a verbose flag, since fast-serve has no log levels: maybe just collapse them), warnings for "not supported" and failures. The output's `output (not used in development)` line didn't appear because `output.filename` already equalled `'[name].js'`.

## 6. Prototype and verification

Files (outside the repo, kept for reference):
- `/var/tmp/wp-research/node_modules/spfx-fast-serve-helpers/lib/webpackCustomization/index.js` (copy in `/var/tmp/wp-research/research-prototype/webpackCustomization.js`), wired into `lib/plugins.js` as the first plugin (`plugins.js.orig` = original);
- test customization: `config/spfx-customize-webpack.js` → `config/webpack/contoso.js` (the user's logic, private helpers stubbed in `scripts/helpers.js`); `src/common/contosoInfo.ts`, `src/common/renderBadge.ts` (lit), HelloWorld renders them plus an rsuite `Button` and imports `rsuite/dist/rsuite-no-reset.min.css`; tsconfig `paths` `@src/*` added (and removed for the no-paths test).

| Check | Result |
|---|---|
| `heft build --clean` with the customization | OK; defines inlined, `@src` → `lib/common/*.js`, babel removed `??=` from lit **[V]** |
| fast-serve **without** the prototype | `CONTOSO_*` left as free identifiers (ReferenceError at runtime); `@src` works only through tsconfig `paths`; rsuite CSS global **[V]** |
| fast-serve **with** the prototype, `/@vite/env` | `const defines = {"CONTOSO_API": "https://api.contoso.example/v1", "CONTOSO_BUILD_TIME": "20261119011402", …, "DEBUG": true, …}` **[V]** |
| no tsconfig `paths`, prototype | `HelloWorld.tsx` imports `/src/common/contosoInfo.ts` (alias rewritten lib → src) **[V]**; without the prototype: "Failed to resolve import" **[V]** |
| live on the tenant (`spfx-rea.aspx`, headless Chrome) | `[vite] connected.`; web part text `api=https://api.contoso.example/v1 client=1111… host=https://ecm.contoso.example built=20261119011542 v=1.0.0.0`; rsuite button `rgb(52,152,255)` background, 6 px radius, white text; lit output `lit ok` in `rebeccapurple`; `window.CONTOSO_API` set **[V]** |
| edit `scripts/helpers.js` while running | "scripts/helpers.js changed, restarting the dev server", `/@vite/env` shows the new value **[V]** |
| second start (new `CONTOSO_BUILD_TIME`) | no dependency re-optimization **[V]** |
| `webpack-patch.json` patch files, order patch → customize | run and reported **[V]** |
| timing | customization step 645–651 ms; `ready in` ≈1.0 s vs ≈0.4 s without **[V]** |

## 7. Implementation sketch for `src/` (if approved)

- `project/webpackCustomization.ts` (plain Node, no Vite imports): find the scripts (`config/spfx-customize-webpack.js`; `config/webpack-patch.json` incl. rig fallback; read `customizationFilename` from the project's `config/heft.json` override if present), generate the SPFx config, run the scripts, diff, return `{ define, aliases, ignored, unsupported, failures, watchFiles }`. Unit-testable with a fake generator.
- `transforms/` or a new `webpackCustomization/` feature plugin: `config()` → `define` + `resolve.alias`; `configureServer` → watch + restart (like `config/sass.json`); print the report once per (re)start.
- Details to get right:
  - diff `definitions` of pre-existing `DefinePlugin`s (scripts that mutate SPFx's one);
  - skip keys that aren't identifiers/member paths (`typeof window`);
  - validate define values (JSON literal or parseable expression, warn otherwise);
  - seed `devServer: {}`;
  - stub `taskSession` (`taskName: 'fast-serve'`, `parameters.production=false`, `watch=true`, a `logger` routed to fast-serve's logger) and `heftConfiguration` (`buildFolderPath`, `projectConfigFolderPath`, `projectPackageJson`, `rigConfig` if cheap);
  - await a returned promise (heft doesn't, but harmless);
  - map `alias` arrays → first entry, `false` → unsupported.
- Docs: README section "Webpack customizations", migration note (classic `webpack.extend.js` → put dev-relevant bits in the heft script); KB decision.
- Effort: module + tests ≈1 day, wiring/watch/report ≈0.5 day, docs + live check ≈0.5 day.

## 8. Open questions for the user

1. Is the user's customization a `webpack-patch.json` patch file (paths suggest `config/webpack-patch/…`) or `spfx-customize-webpack.js`? Both are covered, but confirms the priority.
2. How does their `treatRsuiteCssAsGlobal` find the two rules? On 1.24 a copy of the global rule without excluding rsuite from the original fails `heft build` (double `sp-css-loader`). It may be a leftover.
3. Is ≈0.65 s extra start time acceptable for customized projects, or should the translation run in parallel with server creation (it must finish before Vite resolves its config, so the gain is small)?
4. Escape hatch: is `taskSession.taskName === 'fast-serve'` / `FAST_SERVE=1` enough, or is a declarative `define`/`alias` in `config/fast-serve.json` wanted too?
