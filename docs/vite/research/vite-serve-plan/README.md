# From PoC to a reusable package: parity list, architecture, gaps

> **Current status, decisions and the updated P0/P1 list are in [../../HANDOFF.md](../../HANDOFF.md).** This file is the original plan. Some statuses here are out of date: localized resources from node_modules do work, and the `sp-*` design is now on-demand top-level-await facades.

Date: 2026-11-15. Inputs:
- the current PoC ([tools/vite-plugin-spfx-serve](../../poc/plugin/));
- [spfx-fast-serve-helpers](https://github.com/s-KaiNet/spfx-fast-serve-helpers), branch `v1.21`, the latest;
- [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve): README, docs/FAQ, LibraryComponents, `samples/advanced`;
- the SPFx 1.24 Heft pipeline research ([../spfx-pipeline](../spfx-pipeline/index.md));
- a direct check of what `@microsoft/spfx-heft-plugins` exports.

Priority: **P0** = needed before anyone else can use it, **P1** = common projects need it, **P2** = niche.
Status: ✅ in the PoC, 🟡 partly there, ❌ missing.

---

## 1. Parity list (1:1 with `heft start` + what fast-serve offers)

### 1.1 Component types

| Feature | SPFx behaviour to match | Vite approach | Pri | Status |
|---|---|---|---|---|
| Web part | manifest + AMD `<id>_<ver>`, `default` export = class | shim + ESM entry | P0 | ✅ |
| **Several components in one bundle** (`config.json` bundle with >1 component, e.g. `bundle-pack-1` in the advanced sample) | Heft generates `temp/build/bundle-entries/<bundle>.js` with `export * as a from …; export * as b from …`. Each manifest gets `loaderConfig.exportName = "a"`, and all of them share one `entryModuleId` / script | one shim per **bundle**. The virtual entry re-exports each component under its `exportName`, and each manifest carries its `exportName` | P0 | ❌ (PoC is one shim per component) |
| Application Customizer | `componentType: "Extension"`, loaded through `?loadSPFX=true&customActions={…}` | manifest handler + query-string builder from `serve.json` `serveConfigurations` | P0 | ❌ (skipped) |
| ListView Command Set | same, `customActions` with `location: ClientSideExtension.ListViewCommandSet.*` | same | P0 | ❌ |
| Field Customizer | `?fieldCustomizers={…}` | same | P1 | ❌ |
| Form Customizer | `?componentId=…&PageType=…&RootFolder=…` (from `formCustomizer` in serve.json) | same, like fast-serve `openUrl.ts` | P1 | ❌ |
| Adaptive Card Extension (cards) | `componentType: "AdaptiveCardExtension"`. The code uses `require('./assets/x.svg')` and `require('./template/QuickView.json')`; card/quick views load lazily with `import()` | manifest handler + `require()` transform (see 1.3) + dynamic import | P0 (Viva) | ❌ |
| Library component: **the library project itself** | fast-serve `isLibraryComponent`: port 4320, `writeToDisk`, consumers load its `dist` | serve the library's manifest from its own server. The consumer's `manifests.js` combines several origins | P1 | ❌ |
| Library component: **consumer with a linked local library** (`npm i ../lib`, workspaces) | fast-serve serves `<pkg>/dist` statically and lists it as a component external | option A: keep it external (consumer gets the library's manifest from its server). Option B (better dev experience): alias the library to its `src` so HMR crosses both projects. That loses the singleton across bundles; document it | P1 | 🟡 (externalized only if `dist/*.manifest.json` exists) |
| Teams tab / personal app / Office / Outlook hosts | same web part; debug in Teams needs the Teams app URL with the debug query (fast-serve "MS Teams Toolkit" doc) | docs + URL builder | P2 | ❌ |
| Isolated web parts (`isDomainIsolated`) | web part runs in an iframe on an isolated domain | check how debug manifests behave there | P2 | ❓ |
| Copilot agent output (`copilot-agent-plugin`, new in the 1.24 rig) | writes `teams/<agent>.zip` during build | out of scope for serve, but make sure the watcher ignores `teams/` and `temp/copilot` | P2 | 🟡 |

### 1.2 Dependencies and externals

| Feature | SPFx behaviour | Vite approach | Pri | Status |
|---|---|---|---|---|
| `@microsoft/sp-*` as externals | **every** SPFx Library manifest found in `node_modules` + react/react-dom/graph client (`ExternalsProcessor`) | 🟡 PoC scans `dependencies` with `dist/*.manifest.json`. Use the same discovery as Heft (`CumulativeManifestProcessor`, or the generator's `externals` list) | P0 | 🟡 |
| **sp-\* imported by third-party packages** (`@pnp/spfx-controls-react`, `@pnp/sp` SPFx behaviours, `@microsoft/mgt-spfx-utils`) | webpack makes them external everywhere, including inside node_modules | Vite's dependency pre-bundling (Rolldown) would **bundle a second copy of sp-core-library / sp-http** into the dep, which breaks ServiceScope / pageContext. The externals plugin must also run inside `optimizeDeps.rolldownOptions`, and the manifest must list externals imported by deps, not just by `src/` | **P0** | ❌ |
| Dynamic import of an SPFx library (`await import('@microsoft/sp-property-pane')`) | `AsyncComponentPlugin` turns it into `SPComponentLoader.loadComponentById` | facade resolves lazily through the component's RequireJS, not the preloaded registry | P0 | ❌ (throws "not preloaded") |
| Externals not imported at startup (added during the session) | heft rebuild regenerates the manifest | PoC asks for a page reload. Better: lazy RequireJS load (same as the row above) | P1 | 🟡 |
| `config.json` `externals`: local file (`"marked": "node_modules/marked/marked.min.js"`) | copied to dist, `scriptResources` `type: path` | either serve the file + manifest entry + facade over `window.require`, or "bundle in dev" mode (simpler, slightly different from prod) | P1 | ❌ |
| `externals` CDN URL / `{ path, globalName, globalDependencies }` (non-AMD globals, jQuery plugins) | `LegacyExternals` | manifest entry + facade reading `window[globalName]` | P2 | ❌ |
| React from the page | external, tenant version | dev React copy (agreed) + `resolve.dedupe: ['react','react-dom']` so Fluent UI and pnp controls share the **same** dev React | P0 | 🟡 (no dedupe) |
| `react-dom/client` vs `react-dom` (React 17 projects) | both are components | handled by the dev React copy; test on a React 17 fixture if older SPFx is targeted | P2 | ✅ |
| tsconfig `paths` / `baseUrl` aliases (fast-serve `TsconfigPathsPlugin`; advanced sample `@src`) | resolved by tsc | Vite's tsconfig-paths support | P1 | ❌ |

### 1.3 Source transforms

| Feature | SPFx behaviour | Vite approach | Pri | Status |
|---|---|---|---|---|
| TS/TSX | tsc → `lib/` → webpack | oxc transform (Vite 8) | P0 | ✅ |
| **Type-only re-exports without `type`** (`export { IFoo } from './x'`, common in SPFx code) | tsc removes them | oxc/esbuild can't know a name is a type → browser error *"does not provide an export named IFoo"*. Detect it and report a clear message, optionally rewrite it. Recommend `verbatimModuleSyntax`/`isolatedModules` | **P0** | ❌ |
| `const enum` across files, `namespace` merging, `export =` | tsc | not supported by isolated transpilers; detect + document | P1 | ❌ |
| Legacy decorators (`experimentalDecorators: true` in the rig tsconfig; old extensions use `@override`) | tsc | oxc legacy-decorator support: check it works; `emitDecoratorMetadata` is rare | P1 | ❓ |
| **CommonJS `require('./x.png' / './t.json' / './a.svg')` in TS source** (ACE scaffolds, older web parts, the advanced sample) | webpack handles it | transform `require('<literal>')` → hoisted `import` (static paths only) | **P0** | ❌ |
| `.html` imports (html-loader → string) | `asset/source` | load as a string export | P2 | ❌ |
| `*.sprite.svg` → string | `asset/source` | load as a string export | P2 | ❌ |
| Images/fonts → URL (`png jpg gif svg woff eot ttf`) | `asset/resource` | Vite default + `server.origin` | P0 | ✅ |
| `DEBUG`, `process.env.NODE_ENV` defines | DefinePlugin | `define` | P0 | 🟡 (`DEBUG` only) |
| `require.context`, `require.ensure`, `module.hot`, `__webpack_public_path__` (`@types/webpack-env` is in the rig tsconfig) | webpack runtime | not supported: detect + warn | P2 | ❌ |

### 1.4 Styles

| Feature | SPFx behaviour | Vite approach | Pri | Status |
|---|---|---|---|---|
| `.module.scss` CSS modules | sass → `*.module.scss.css` → sp-css-loader; class `local_<hmac8>` | Vite CSS modules (class name format differs; harmless) | P0 | ✅ |
| Global `.scss` / `.css` / node_modules CSS (pnp controls, fontawesome) | global | Vite default | P0 | ✅ |
| Theme tokens `"[theme:x, default:y]"` | `load-themed-styles` | runtime over `__themeState__` | P0 | ✅ |
| Theme change at runtime | `loadTheme` → `reloadStyles` | PoC polls every 500 ms. Better: hook `__themeState__.theme` with a setter, or wrap `loadTheme` | P1 | 🟡 |
| **`.module.scss` typings** (`temp/sass-ts/**/*.module.scss.d.ts`, used through tsconfig `rootDirs`) | `heft-sass-plugin` | regenerate on change while serving, otherwise new class names show as TS errors in the IDE (fast-serve did this with `spfx-css-modules-typescript-loader`) | **P0** (DX) | ❌ |
| Static asset typings (`temp/static-asset-ts`) | `heft-static-asset-typings-plugin` | same: regenerate for new assets, or ship one generic `*.png` d.ts | P1 | ❌ |
| Rig `sass.json`: `silenceDeprecations`, bare package imports, `.global.scss` | heft-sass-plugin | read `config/sass.json` (with `extends`) → `css.preprocessorOptions.scss` | P1 | ❌ |
| `~pkg/…` Sass imports | sass-loader convention | alias | P0 | ✅ |
| Fluent `@import '~@fluentui/react/dist/sass/References.scss'` | — | check on the advanced fixture | P1 | ❓ |

### 1.5 Localization

| Feature | SPFx behaviour | Vite approach | Pri | Status |
|---|---|---|---|---|
| `localizedResources` → src `loc/<locale>.js` | AMD loc module | virtual module | P0 | ✅ |
| **Loc resources in node_modules** (`"ControlStrings": "node_modules/@pnp/spfx-controls-react/lib/loc/{locale}.js"`) | mapped as-is | PoC maps every path `lib/`→`src/` and **fails** for node_modules paths | **P0** | ❌ |
| `--locale` switch / `SPFX_LOCALE` env / fallback when a locale is missing | `heft start --locale` | option + env | P1 | 🟡 |
| TypeScript loc files (`loc/en-us.ts`, fast-serve `TypeScriptResourcesPlugin`) | supported | virtual module from TS | P1 | ❌ |
| `.resx` resources (`staticAssetsToCopy` includes `.resx`; `*.resx.ts` codegen) | supported | check what the 1.24 rig does, then match it | P2 | ❓ |
| Loc file without `{locale}` placeholder | `default.js` (fast-serve special case) | handle it | P2 | ❌ |

### 1.6 Serve and dev experience (fast-serve options as a checklist)

| fast-serve option / feature | Vite approach | Pri | Status |
|---|---|---|---|
| `port` (4321; library 4320) | `config/serve.json` + option | P0 | ✅ |
| HTTPS dev cert | use `@rushstack/debug-certificate-manager` (`CertificateStore`), which creates and trusts the cert, instead of reading files from `~/.rushstack` | P0 | 🟡 |
| port in use → release (`kill-port`) | `strictPort` + clear message (killing other processes is risky) | P2 | 🟡 |
| `config` = `serve.json` `serveConfigurations` (pageUrl, customActions, fieldCustomizers, formCustomizer) | URL builder; can reuse `SPFxDebugPageUrl` from `@microsoft/spfx-heft-plugins` | P0 | ❌ |
| `openUrl` + `{tenantDomain}` / `SPFX_SERVE_TENANT_DOMAIN` | `server.open` | P1 | 🟡 (printed only) |
| `fullScreenErrors` | `server.hmr.overlay` (check the Vite overlay renders inside SharePoint) | P1 | ❓ |
| `eslint` (lint dirty modules) | `vite-plugin-checker` eslint (flat config) | P1 | ❌ |
| async type checking (fork-ts-checker) | `vite-plugin-checker` typescript | P0 | ❌ |
| `hotRefresh` | built in (always on) | — | ✅ |
| `reactProfiling` | alias `react-dom` → `react-dom/profiling` (with the dev copy, DevTools already work) | P2 | ❌ |
| `containers` (Docker/WSL2/Codespaces: host 0.0.0.0, polling, wss URL) | `server.host`, `watch.usePolling`, `hmr.clientPort`, auto-detect like fast-serve `isDocker()` | P1 | ❌ |
| `loggingLevel`, `debug` | Vite `logLevel` + plugin debug logging (env/flag) | P1 | 🟡 |
| `memory` | not needed | — | — |
| ngrok / mobile testing (`NgrokServePlugin`) | tunnel host as `server.origin` + HMR through the tunnel, `allowedHosts` | P2 | ❌ |
| VS Code debugging | launch.json template; source map paths differ from `webpack:///` | P1 | ❌ |
| live reload when HMR can't apply | `full-reload` | P0 | ✅ |
| "new dependency → restart" (fast-serve FAQ #3) | Vite re-optimizes deps by itself; manifest rescan | P1 | 🟡 |
| webpack extensibility (`fast-serve/webpack.extend.js`) | the user's own `vite.config.ts` (`mergeConfig`, extra plugins) | P0 | ✅ (by design) |
| `config add` / `webpack extend` commands, JSON schema | `init` command + typed options | P1 | ❌ |
| version check (helpers `~1.<spfxMinor>` must match SPFx) | same check | P0 | ❌ |
| npm / pnpm / yarn | resolve everything from the project root; peer deps | P0 | 🟡 |

---

## 2. Architecture for the package

### 2.1 What to keep from spfx-fast-serve-helpers

| fast-serve-helpers | Why it works | Vite equivalent |
|---|---|---|
| `serve.ts`: a commander CLI + `commands/*` | zero-config `npm run serve` | `cli/` running Vite **programmatically** (`createServer`) when the project has no `vite.config` |
| `common/settingsManager.ts`: defaults < `fast-serve/config.json` < CLI | predictable precedence | `config/` with the same precedence, typed options + generated JSON schema |
| `settings/*.ts`: one `ApplySettings(config)` per option, composed in `settings/index.ts` | each feature is self-contained | `features/*`: one feature module returns Vite plugin(s), composed from a single list |
| reuses SPFx's own generated webpack config (`temp/_webpack_config.json`: externals, entry, output, ManifestPlugin options) instead of re-deriving the contract | SPFx stays the source of truth | `project/` adapters over `@microsoft/spfx-heft-plugins` exports (see 2.4) |
| `webpack.extend.js` (merge + transform) | escape hatch | the user's `vite.config.ts`. Our plugin is just `spfxServe()` in `plugins` |
| version-locked to SPFx minor (`~1.21.0`) + `checkVersions()` | internal APIs change every release | same: `<pkg>@~1.24.0` |
| installer (`spfx-fast-serve` → `Pipeline(PatchGulpFile, PatchPackageJson, Install)`) | one command to adopt | `npx <pkg> init` with the same pipeline-of-steps pattern (no gulpfile now: add devDeps, script, optional `vite.config.ts`) |

What to avoid: global mutable `serveSettings` imported everywhere (fast-serve `settingsManager`), regex-patching generated files (`getEntryPoints` rewrites bundle-entries on disk), and string-built browser code.

### 2.2 Layers (dependencies point one way: `cli → features → project`; `runtime` is separate)

```
┌───────────────────────────────────────────────────────────────────────┐
│ cli/        commander: start (default), init, config add             │
│             builds InlineConfig, calls vite.createServer()           │
├───────────────────────────────────────────────────────────────────────┤
│ index.ts    spfxServe(options): Plugin[]  ← used in user vite.config │
│             = createContext() + features.flatMap(f => f.plugins(ctx))│
├───────────────────────────────────────────────────────────────────────┤
│ features/   one folder per concern, each returns Vite plugin(s)      │
│   core/ manifests · component-shim · entries · externals             │
│   component-types/ webpart · extension · ace · library  (registry)   │
│   localization · styles/(theme-tokens, css-typings, sass-config)     │
│   transforms/(require, raw-assets, type-reexport-guard, defines)     │
│   react-refresh · https · open-url · containers · checker · ngrok    │
├───────────────────────────────────────────────────────────────────────┤
│ project/    pure Node, no Vite imports, unit-testable                │
│   SpfxProject (facade, cached, invalidate(file))                     │
│   configJson · serveJson · sassConfig · manifests · externals        │
│   locales · paths(lib→src) · spfxVersion                             │
├───────────────────────────────────────────────────────────────────────┤
│ runtime/    browser code, real TS files built to dist/runtime/*.js   │
│   amd-shim (template params injected as JSON) · externals-registry   │
│   themed-styles · hmr-helpers                                        │
└───────────────────────────────────────────────────────────────────────┘
```

### 2.3 Core types (the extension points)

```ts
// shared, created once per server
interface ServeContext {
  options: ResolvedOptions;      // typed, defaults applied
  project: SpfxProject;          // read-only SPFx facts, cached
  origin: string;                // https://localhost:4321
  logger: Logger;                // prefixed Vite logger
}

// one per concern, like fast-serve's ApplySettings
interface Feature {
  name: string;
  enabled?(ctx: ServeContext): boolean;      // e.g. containers auto-detect
  plugins(ctx: ServeContext): PluginOption[];
}

// one per SPFx componentType: adding cards/extensions = adding a handler
interface ComponentTypeHandler {
  type: 'WebPart' | 'Extension' | 'AdaptiveCardExtension' | 'Library';
  toDebugManifest(c: SpfxComponent, b: BundleInfo, ctx: ServeContext): ClientSideManifest;
  debugQuery?(cfg: ServeConfiguration): Record<string, string>; // customActions, fieldCustomizers, …
}

// project model
interface SpfxProject {
  version: string;               // package.json
  spfxVersion: string;
  bundles(): BundleInfo[];       // config.json, with exportName per component
  externals(): ExternalsMap;     // name → {id, version} | {path, globalName}
  localizedResources(locale): Map<string, ResolvedLocFile>;
  serveConfig(): ServeJson;
  invalidate(file: string): ProjectChange | undefined; // features subscribe to changes
}
```

Rules that keep it easy to follow:
- `project/` never imports `vite`. `features/` never parse SPFx JSON themselves.
- Browser code lives in `runtime/*.ts`, is compiled, and gets values through one injected JSON object, not string concatenation.
- One file = one feature. `features/index.ts` is the only list to change when a feature is added.
- Options are validated once (zod or valibot) in `config/`. The same schema produces the published JSON schema (fast-serve keeps hand-written `schema/config.v2.schema.json`).

### 2.4 Reuse Microsoft's code for the contract (checked)

`@microsoft/spfx-heft-plugins` 1.24.1 exports, among others:
- `WebpackConfigurationGenerator`;
- `_readConfigFileAsync`, `_readServeConfigFile`;
- `CumulativeManifestProcessor`, `DependencyDiscoveryMode`;
- `ManifestPlugin`;
- `SPFxDebugPageUrl`;
- `_normalizeLocaleName`;
- `_LegacyExternals`.

I called `WebpackConfigurationGenerator.generateWebpackConfigurationAsync({ serveMode: true, production: false, … })` from plain Node with **no Heft build**:
- It took about 0.7 s.
- It returned the entries with AMD names (`2997f152-…_0.0.1`) and the **full** externals list (sp-core-library, sp-http, sp-page-context, sp-loader, …).
- It also returned `ManifestPlugin` / `AsyncComponentPlugin` instances whose options describe the exact contract.

The script is in [generate-spfx-webpack-config.cjs](generate-spfx-webpack-config.cjs). Run it from the project root.

This is fast-serve's "reuse SPFx's own config" idea, without running `gulp bundle` first.

Recommendation: put these behind the `project/` adapters:
- `externals.ts` from the generator (or `CumulativeManifestProcessor`);
- `configJson.ts` / `serveJson.ts` from the readers;
- `open-url` from `SPFxDebugPageUrl`.

If an API changes in a later SPFx, only that adapter changes. Keep the PoC's own implementation as the fallback.

### 2.5 Package shape

```
spfx-vite-serve/                 (name TBD)
  package.json  peer: vite ^8 · deps: @vitejs/plugin-react, @rushstack/debug-certificate-manager,
                vite-plugin-checker, es-module-lexer · peer/dep: @microsoft/spfx-heft-plugins (from the project)
  src/{cli,config,project,features,runtime,index.ts}
  test/unit       project/*, transforms (vitest)
  test/integration start a server on fixtures, fetch manifests.js / shim / modules
  test/e2e        Playwright on a real tenant page (opt-in, like this research)
  fixtures/       basic · advanced (mirror of fast-serve samples/advanced) · extensions · ace · library(+consumer)
```

Develop it as a workspace inside this repo first (`packages/spfx-vite-serve`, with this project as the first fixture), then publish.

---

## 3. Things that are easy to miss

1. **Duplicate SPFx libraries through pre-bundled deps.** This is the biggest correctness risk (see 1.2). A second `sp-core-library` instance fails quietly: wrong `ServiceScope`, `pageContext` undefined inside pnp controls.
2. **Type-only re-exports** crash at runtime in the browser, even though tsc and Heft are happy. Add a guard with a clear error message.
3. **CORS reflects any origin.** With `Access-Control-Allow-Private-Network`, any website you open can read your source from `localhost` while serve runs. Restrict origins to `*.sharepoint.com`, `teams.microsoft.com`, `*.office.com`, `outlook.*`, configurable.
4. **Typings for SCSS modules and assets** are generated by Heft, not Vite. Without them the IDE shows errors after you add a class or image.
5. **HMR and module side effects:**
   - `initializeIcons()` / `registerIcons` warn when modules re-run;
   - PnPjs `spfi().using(SPFx(ctx))` singletons;
   - global event listeners.

   Document `import.meta.hot.dispose` patterns. Keep the web part class as a full-reload boundary, as now.
6. **Shared state between bundles differs from prod.** In dev every bundle shares one ESM graph, so a module used by two bundles is one instance. In prod each bundle has its own copy. That's rarely a problem, but document it.
7. **Large solutions:** unbundled ESM means hundreds of requests from the SharePoint page. Fluent UI is pre-bundled, which helps. For big `src/` trees, check Vite 8's bundled-dev mode, or at least measure.
8. **Install friction:**
   - `@vitejs/plugin-react` 6 declares optional peers on Babel 8, which clashed with Jest's Babel 7 under npm and needed `--legacy-peer-deps`. Pin or bundle it so `npm i` stays clean.
   - pnpm strict layout: resolve `react`, `react-refresh` and `@microsoft/*` from the **project**, not the package.
9. **Browser gates are the top support issue (FAQ material):**
   - trusted cert;
   - Chrome/Edge Local Network Access prompt;
   - debug query `sessionStorage` stickiness;
   - "Allow debug scripts";
   - Firefox/Safari certificate trust.
10. **Production must stay untouched:**
    - no `vite/client` types in the main tsconfig;
    - ESLint must ignore the package's generated files;
    - `heft build` mustn't pick up anything Vite writes (Vite writes nothing by default; keep it that way, apart from the typings in `temp/`).
11. **Telemetry:** decide early. fast-serve tracks runs, and its function key sits in public source.
12. **Version policy:** lock to SPFx minor (`~1.24.0`), add a startup check, and keep a version matrix doc like fast-serve's `VersionMatrix.md`.
13. **Windows:** `/@fs/C:/…` paths, case-insensitive paths in `lib→src` mapping, and certificate store differences.
14. **Docs to write:** migrating from `heft start` / fast-serve, HMR guidance (function components, side effects), library-component setup, Teams debugging, and a VS Code `launch.json`.

---

## 4. Future improvements (not v1)

### 4.1 Re-mount web parts instead of reloading the page
**Problem.** HMR falls back to a full SharePoint page reload (2.5–6 s) when an update reaches a module nothing can accept. Typical causes:
- the web part class itself was edited;
- a service or utility the web part class also imports was edited;
- a file exports both components and other values;
- a module creates state when it loads.

**Idea.** When an update reaches the generated entry, re-mount live web part instances instead of calling `location.reload()`:
1. In dev, the entry exports a thin subclass that records every instance SharePoint creates.
2. When the web part class itself changed, copy the new class's prototype methods onto the old class. The instances keep their `context`, `properties` and `domElement`.
3. For each instance, call `onDispose()` (unmounts the React root), then `render()`.
4. A simpler first step: if the web part class didn't change (the shared-service case), only call `render()` again with the new modules.

This uses only public SPFx methods (`render`, `onDispose`) plus plain JavaScript; no internal web part manager.

**Limits (fall back to a reload):**
- `onInit` changed (detect it by comparing its code);
- changed field initialisers don't reach existing instances;
- React state is lost (it's a re-mount, not Fast Refresh);
- an open property pane keeps the old configuration until it's reopened;
- module-level state is created again.

**Before building:** a live check that `onDispose()` followed by `render()` on an existing instance behaves well in SharePoint, including the property pane, theme changes and multiple instances on one page.

Status: idea only. The user decided it's not for v1 (2026-11-16).
