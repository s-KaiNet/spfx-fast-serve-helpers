# spfx-fast-serve-helpers (Rspack line)

> **Preview.** The Rspack implementation of `fast-serve` for SharePoint Framework **1.24.x** (Heft) projects, versions `1.24.0-rspack.<n>`. The Vite implementation (`1.24.0-beta.<n>`) lives on branch `v1.24`. Both have the same CLI, options and page behaviour; this line exists to compare them on real projects.

A dev-server-only replacement for `heft start`: it compiles your web parts, extensions and Adaptive Card Extensions with [Rspack](https://rspack.rs), serves them over HTTPS to a real SharePoint page, and applies edits with HMR and React Fast Refresh. SharePoint loads a few AMD bundles per page, like with heft, instead of one request per module. Production builds, type checks and packaging stay on Heft (`heft build`, `heft package-solution`).

Design and status: [research/HANDOFF.md](research/HANDOFF.md), plan [research/rspack/PLAN.md](research/rspack/PLAN.md), knowledge base [kb/index.md](kb/index.md).

## Requirements

- An SPFx **1.24.x** project (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`). `fast-serve` checks the installed SPFx version at start and exits with a message otherwise. For SPFx up to 1.21 use the classic [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve); 1.22 and 1.23 are not supported.
- Node.js 22 (from 22.14), 24 or 26, as SPFx 1.24.
- The SPFx development certificate, trusted once per machine (`npx heft trust-dev-cert`, the same one `heft start` uses).

## Install

The Rspack line is not published; install a packed tarball:

```sh
npm install --save-dev /path/to/spfx-fast-serve-helpers-1.24.0-rspack.14.tgz
npx heft trust-dev-cert                     # once per machine
```

**npm `ERESOLVE` with `css-loader`:** a project with `css-loader` 7.1.2 or 7.1.3 (a direct devDependency, or locked at that version) fails with `ERESOLVE ... peerOptional @rspack/core@"0.x || 1.x" from css-loader@7.1.2`, because those versions don't accept Rspack 2. `css-loader` 7.1.4 and newer accept it, and SPFx's `@microsoft/sp-css-loader` (`~7.1.2`) works with them, so update it in the same command:

```sh
npm install --save-dev css-loader@^7.1.4 /path/to/spfx-fast-serve-helpers-1.24.0-rspack.14.tgz
```

If you must keep the old `css-loader`, install with `--legacy-peer-deps` (or put `legacy-peer-deps=true` in the project's `.npmrc`, which also covers later `npm install` runs). The package can't avoid this itself: npm puts `@rspack/core` at the top of `node_modules`, where the project's `css-loader` checks its peer range, and `@rspack/dev-server` requires `@rspack/core` as a peer, so it can't be hidden under another name; `overrides` only work in the project's own `package.json`. pnpm and yarn only warn.

`@rspack/core`, `@rspack/dev-server`, `@rspack/plugin-react-refresh` and `sass-loader` are dependencies of this package, so the project needs no Rspack or webpack packages. From the project it uses what heft uses too: React and react-dom (development build, for Fast Refresh), `@microsoft/sp-css-loader`, `sass-embedded` (or `sass`) and `@rushstack/heft-sass-plugin` (SCSS typings).

Add a script to `package.json`:

```jsonc
"scripts": {
  "serve": "fast-serve"
}
```

## Usage

```sh
npm run serve
```

```
[fast-serve] compiled in 1951 ms
[fast-serve] ready in 2177 ms at https://localhost:4321
[fast-serve] web parts: BenchTreeWebPart, BenchPnpWebPart
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
```

Open the printed URL and click **Load debug scripts**. Without a configured page, append the printed query to any SharePoint page URL (replacing its own query). A web part must already be on the page: add it from the toolbox while `fast-serve` runs and save the page. Stop the server with Ctrl+C.

All bundles are compiled before the server reports ready; later starts reuse a cache in `temp/fast-serve/cache` (see [Performance](#performance)). SCSS and static-asset typings (`temp/sass-ts`, `temp/static-asset-ts`) are written right after the first compile and kept current while serving.

### Extensions and serve configurations

Extensions load through the same query parameters `heft start` builds from `config/serve.json` `serveConfigurations`. `fast-serve` uses `default` or the one picked with `--config <name>` (`--serve-config` too) and prints its page:

```
npm run serve -- --config commands
[fast-serve] serve configuration: commands
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/Lists/Tasks/AllItems.aspx?debugManifestsFile=…&noredir=true&loadSPFX=true&customActions=%7B…
```

- `customActions` (Application Customizers, ListView Command Sets), `fieldCustomizers` and `formCustomizer` become `loadSPFX=true` plus the JSON parameters, or the form parameters (`componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties`). As in heft, `debug=true` is left out then.
- Page order (heft's, with the `pageUrl` option in place of heft's fallbacks): the selected configuration's `pageUrl` unless it is `default` → the `pageUrl` option → `serveConfigurations.default.pageUrl` → `initialPage`. `{tenantDomain}` is replaced with `SPFX_SERVE_TENANT_DOMAIN`. The page's own query is replaced, a `#hash` kept.
- Use a SharePoint page. Microsoft retires the SharePoint Online workbench (`/_layouts/workbench.aspx`, the `initialPage` the generator may write) on December 1, 2026: `fast-serve` warns about a page URL that points to it and ignores it.
- An unknown `--config` name warns with the available names and falls back to `default`. At start `fast-serve` warns about configurations that can't work: ids that aren't your extensions, a component of the wrong kind for its slot, unknown locations, the generator's placeholders (`InternalFieldName`, `/sites/mySite/Lists/MyList`).
- Editing `config/serve.json` restarts `fast-serve` and prints the new URL.

### Adaptive Card Extensions

ACEs load with the web-part debug query on a SharePoint page, as in [Microsoft's ACE tutorial](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension): open your test page with it, edit the page and add the card from the toolbox. Card actions and quick views are disabled in edit mode: they work in read mode, on a saved page. When the selected serve configuration loads extensions, `fast-serve` also prints the web-part debug query for adding ACEs.

Quick-view templates (JSON imports), images and the lazily loaded property pane (`import()` → `chunk.<name>.js`) come from the dev server; `@microsoft/sp-adaptive-card-extension-base` and the other SPFx libraries come from the page.

## Options

Zero config works. Precedence: command-line flags → `fast-serve/config.json` → `config/serve.json` (port, pages) → defaults (port `4321`, locale `en-us`, overlay on).

```jsonc
// fast-serve/config.json (optional, JSON with comments)
{ "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us", "serveConfiguration": "default", "overlay": true, "deployedLibraries": [] }
```

| Option | Flag | Meaning |
|---|---|---|
| `port` | `-p, --port` | HTTPS port on `localhost` |
| `pageUrl` | `--page-url` | page printed with the debug query (see the page order above) |
| `locale` | `--locale` | locale of the `localizedResources` strings, with a per-resource fallback to `en-us` |
| `serveConfiguration` | `--config`, `--serve-config` | `config/serve.json` serve configuration (default `default`) |
| `overlay` | `--no-overlay` | `false` turns off the error overlay over the page; errors still go to the terminal and the browser console |
| `deployedLibraries` | (file only) | package names of [linked SPFx library projects](#library-components) to load from SharePoint (the deployed copy) instead of compiling their `src` |

An unknown key or a wrong type in `fast-serve/config.json` stops `fast-serve` with the list of supported keys. `amdPackages` (a Vite-line option) is ignored with a warning. `config/fast-serve.json` from early betas is not read (a warning asks to move it). HTTPS is always on, with the SPFx development certificate.

## What is served and how

- **Bundles:** one AMD bundle per `config/config.json` bundle (several components in one bundle get heft's export names), served from memory under `https://localhost:<port>/dist/`, plus a debug `manifests.js` that lists, per bundle, the SPFx libraries and externals it really uses.
- **SPFx libraries** (`@microsoft/sp-*`, `@microsoft/sp-adaptive-card-extension-base`, third-party library components, `@microsoft/microsoft-graph-client`) are AMD externals loaded by SharePoint, at the tenant's version. Deep imports (`@microsoft/sp-core-library/lib/Version`) are bundled from `node_modules`, like heft; fast-serve warns when your own code makes one and names the file (deep imports inside dependencies are bundled silently).
- **`config/config.json` externals** (URLs and local files, with `globalName`/`globalDependencies`) are loaded by SharePoint's RequireJS like with heft; local files are served next to the bundles. Imports follow webpack's semantics (named imports read from the loaded module, `import *` is the module, default import is `default` when `__esModule`, `export *` works).
- **React** is the project's development build, bundled, with nested copies (for example PnP's) collapsed onto it.
- **Localized strings** of the selected locale are bundled (AMD, TypeScript or ES loc files; non-AMD ones print heft's compatibility warning). Heft keeps them as separate per-locale scripts; with `fast-serve` the page language doesn't switch strings, `--locale` does.
- **Styles:** `sass-loader` with the project's Sass, then the project's `@microsoft/sp-css-loader`, as in heft: CSS module class names are identical to heft's, theme tokens (`"[theme:themePrimary, default: #0078d4]"`) resolve against the page theme, `pkg:` and `~` imports resolve like heft (also into packages whose `exports` hide the Sass files, such as `~@microsoft/sp-office-ui-fabric-core/dist/sass/SPFabricCore.scss`), `config/sass.json` `silenceDeprecations`, `ignoreDeprecationsInDependencies` and `loadPaths` apply.
- **TypeScript:** SWC (`builtin:swc-loader`) per file, with the tsconfig options that change emitted code (`experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, through `extends` and the rig), `paths`/`baseUrl` through Rspack's tsconfig resolver. Type-only re-exports are harmless (webpack semantics; their warnings are hidden). A `const enum` that exists only in a `.d.ts` can't be inlined per file: `fast-serve` reports a clear compile error.
- **`require()` and AMD in dependencies** behave as in heft's webpack: `require('<literal>')` is resolved at build time, UMD dependencies use webpack's own `define` (full `lodash` works), SharePoint's RequireJS never sees them.
- **Static assets** (images, fonts, …) get absolute dev-server URLs; `.sprite.svg` is inlined as source.

## Library components

A library component project (`componentType: "Library"`) that the project depends on **through a link** is compiled from its `src` into your bundles, with hot updates. One command, in the consumer project; nothing to build or start in the library.

```sh
cd corp-lib && npm install          # the library's own dependencies
cd ../my-web-parts
npm install ../corp-lib             # npm "file:" = a symlink; or npm link, pnpm "link:"/"workspace:", npm/yarn workspaces
npm run serve                       # SPFx libraries from source: corp-lib (../corp-lib)
```

- **Detection:** every dependency (also dependencies of linked libraries) whose real path is outside `node_modules` and whose `config/config.json` has a `Library` component. A library installed from a registry, or copied into `node_modules`, stays an SPFx library loaded from SharePoint by id.
- **What is compiled:** `import 'corp-lib'` resolves to the source of the library entry (`./lib/index.js` → `src/index.ts`), `corp-lib/lib/x` to `src/x`. The library's `localizedResources`, tsconfig `paths`/`baseUrl` and `config.json` externals (listed in the debug manifest for the bundles that use them) apply; SCSS, theme tokens and React components work like your own. The library's React imports use your project's React.
- **Edits:** follow the [HMR](#hmr) rules as if the files were yours: a library component → Fast Refresh with state kept; library styles → swapped; library loc strings → hot update when only components use them, page reload when they reach a web part or extension class; the library's `package.json`, `config/config.json`, manifest or tsconfig → `fast-serve` restarts.
- **Opt-out:** `"deployedLibraries": ["corp-lib"]` in `fast-serve/config.json` loads that library from SharePoint: the version deployed to the tenant, by the id of its manifest (no debug manifest for it is served).
- `fast-serve` in the library project itself stops with a message asking to run it in a consumer project.

Limitations, because the library becomes part of your bundles:

- One library instance **per bundle**, not per page: two of your bundles get two copies (module-level state, singletons and `instanceof` are not shared), and other solutions on the page use the deployed library.
- `SPComponentLoader.loadComponentById('<library id>')` loads the deployed library (another instance), or fails if it isn't deployed.
- pnpm and yarn classic `file:` dependencies copy the folder into `node_modules` and are not detected: use `link:`, `workspace:`, `npm link` or npm `file:`.
- The library's `config/sass.json` is ignored (your project's applies); its class names are unique but differ from the library's own `heft` build.
- The library's TypeScript compiles with your project's class options; `fast-serve` warns when the library's `experimentalDecorators`, `emitDecoratorMetadata` or `useDefineForClassFields` differ.
- The library's other dependencies resolve from its own `node_modules` (install them), so a package used by both projects can be bundled twice, like in production.

## Customizing the Rspack config

`fast-serve` never runs heft's webpack config, so a heft customization (`config/spfx-customize-webpack.js`, `config/webpack-patch.json`) doesn't apply. Mirror what development needs in **`fast-serve/rspack.extend.mjs`** (or `.mts`, `.js`, `.ts`, `.cjs`, `.cts`; TypeScript works on Node 22.14 too, `fast-serve` bundles the file itself):

```js
import path from 'node:path';
import { defineConfig, rspack } from 'spfx-fast-serve-helpers';

export default defineConfig(({ root, port }) => ({
  plugins: [new rspack.DefinePlugin({ CONTOSO_API: JSON.stringify('https://api.contoso.com'), CONTOSO_PORT: JSON.stringify(port) })],
  resolve: { alias: { '@src': path.join(root, 'src') } },
  devServer: { headers: { 'X-Contoso': 'dev' } },
}));
```

- **Format:** a Rspack `Configuration` object, a promise of one, or a function `(context, env)`. `context`: `root`, `port`, `origin`, `publicPath`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `rspackVersion`; `env`: `{ command: 'serve', mode: 'development' }`. `defineConfig`, `rspack` and the types (`FastServeConfig`, `FastServeContext`, `Configuration`, …) come from `spfx-fast-serve-helpers`, so the project needs no `@rspack/core` dependency.
- **Merging** (like `webpack-merge`): objects merged, arrays appended (`plugins`, `module.rules`, `externals`, …), other values replaced. `devServer` additions (`proxy`, `headers`, `setupMiddlewares`) are layered on `fast-serve`'s. Keys `fast-serve` owns are ignored with a warning naming the alternative: `entry`, `mode`, `context`, `target`, `amd`, `externalsType`, `output.*`, `devServer.port`/`host`/`server`/`https`/`hot`/`liveReload`/`client`/`webSocketServer`/`devMiddleware`/`allowedHosts`. Rspack `externals` are applied but not listed in the debug manifests: prefer `config/config.json` externals.
- **Restarts:** editing the file or a local file it imports restarts `fast-serve` and the page reloads by itself; adding or removing the file restarts too. A broken file at start stops `fast-serve` with the error; a broken edit keeps the running server.
- **Startup hint:** with a heft webpack customization and no extend file, `fast-serve` prints a hint at start. `export default {};` in the extend file silences it.
- **Coding agents:** the package ships a skill for the translation: `node_modules/spfx-fast-serve-helpers/skills/fast-serve-rspack-config/SKILL.md`. Reference it from the project's `AGENTS.md`/`CLAUDE.md`, or copy it into the project's skills folder.

Most webpack plugins have a `rspack.*` counterpart with the same name (`DefinePlugin`, `ProvidePlugin`, `NormalModuleReplacementPlugin`, `IgnorePlugin`, `CopyRspackPlugin`…); aliases must point into `src` (not `lib`); tsconfig `paths` already work without aliases.

## HMR

| Edit | Result |
|---|---|
| `.tsx`/`.ts` module whose exports are all React components | hot update, state kept (Fast Refresh) |
| `.module.scss` / `.scss` / `.css` | styles swapped without a reload |
| loc file used only by components | hot update |
| web part / extension / ACE class, what only it imports (services, ACE card and quick views, templates), loc files the class imports | page reload |
| a module that exports components **and** other values (hooks, constants) | page reload |
| a new import of an SPFx library or `config.json` external, or an edit of a local-file external | page reload (a bundle's AMD dependency list is fixed when it loads) |
| `package.json`, `config/*.json`, `fast-serve/config.json`, tsconfig, manifests, the extend file (also a linked library's) | `fast-serve` restarts (≈0.1–0.5 s) and open pages reload by themselves |
| a linked library's component, styles, loc strings | same as your own files (see [Library components](#library-components)) |

Several bundles on one page all hot-update. Keep setup (icons, PnPjs, listeners) in `onInit`, not at module level: module code runs again on every hot update. A background tab delays Fast Refresh up to a second (browser timer throttling).

## Errors

- **Compile errors and warnings** go to the terminal with project-relative paths and a code frame (`error in src/…` and `rebuilt in 46 ms (src/…): 1 error`) and to one overlay over the page; the next successful rebuild closes it.
- **Runtime errors from your code** (uncaught errors, unhandled rejections, `console.error` with a frame in your code) are forwarded to the terminal, source-mapped to `src/…:line` with a code frame; uncaught ones also open the overlay, `console.error` calls don't (your code may log errors it handles). The next successful rebuild with new output (also one with only warnings) closes it; if the updated code throws again, it opens again. Esc, × or a click outside closes it too. SharePoint's own errors stay in the browser console.
- **Code that throws while a module runs** (for example a stray `asdf` after an import line, which compiles but fails with `ReferenceError`) opens the overlay too. During a hot update the page keeps showing the previous version of the component until the error is fixed, and the terminal says so. At page load the bundle can't load: the web part's error box shows the reason and the page reloads after the fix.
- **A bundle that fails to load** shows a readable reason in the web part's error box instead of `[object Object]` (compile error, code that threw while loading, missing `config.json` external or SPFx library), and the page reloads after the fix.
- `--no-overlay` / `"overlay": false` turns the overlay off; terminal and console still get everything.

## Performance

Measured on the two test projects of this repository (Linux, Node 24, Rspack 2.3):

| | spfx-rea (5 bundles, 7 components) | spfx-bench (1000 modules, 2 bundles) |
|---|---|---|
| start, no cache (process start → ready) | ≈1.2 s | ≈2.5 s |
| start with the cache in `temp/fast-serve/cache` | ≈0.6 s | ≈0.95 s |
| rebuild after an edit | 50–110 ms | 65–140 ms |
| save → DOM on the page | 120–170 ms | 180–270 ms |

- The persistent cache is keyed on the package and Rspack versions, the full Rspack config (port, locale, extend file result included) and the content of the project's configuration files (`package.json`, lock files, `config/*.json`, tsconfig chain, manifests, extend file and its imports); any change there means one uncached start. Turn it off with `cache: false` (or `cache: true` for memory only) in the extend file; delete `temp/fast-serve/cache` to reset it. Two `fast-serve` instances on the same project with different ports or locales overwrite each other's cache.
- The first SCSS edit after a cached start takes ≈0.5 s (the Sass compiler starts on first use); later ones ≈0.1 s.

## Debugging in VS Code

Source maps (`cheap-module-source-map`) name project files `webpack:///.././src/…`. A Chrome/Edge launch configuration that opens the SharePoint page with the debug query needs:

```jsonc
"sourceMapPathOverrides": { "webpack:///.././src/*": "${workspaceFolder}/src/*" }
```

(Not verified with the VS Code debugger yet.)

## Migrating

**From `heft start`:** install the package, add the `serve` script, keep `config/serve.json` (same configurations, page order and query). Differences in development:

- Strings: one locale is bundled (`--locale`); heft serves per-locale loc scripts.
- Styles: same loader, same class names; heft keeps the first hash of a file for the process lifetime, `fast-serve` changes it on edits (styles hot-update).
- No type checking or linting while serving: run `tsc --noEmit`/ESLint/`heft build` separately.
- A heft webpack customization needs its development counterpart in `fast-serve/rspack.extend.mjs`.
- React and react-dom are bundled from the project in their development build (heft declares them as externals that the page provides); Fast Refresh needs that.
- The Field Customizer on our test tenant is never instantiated by SharePoint, with `heft start` too.

**From the Vite line (`1.24.0-beta.<n>`):** same CLI, options and `fast-serve/config.json`. Replace `fast-serve/vite.extend.mts` with `fast-serve/rspack.extend.mjs` (Rspack/webpack config instead of Vite config; `define` → `rspack.DefinePlugin`, `resolve.alias` stays). `amdPackages` is ignored: Rspack bundles AMD/UMD dependencies itself. Differences you will notice: the server compiles everything before "ready" (Vite compiles on request), a page loads a few bundles instead of one request per module, `require()` and `const enum` across files follow webpack, and errors use `fast-serve`'s own overlay.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `No valid SPFx development certificate found` | `npx heft trust-dev-cert` |
| "Error loading debug manifests" | `fast-serve` isn't running, or the browser doesn't trust the certificate (trust it and restart the browser); allow access to local network devices if Chrome/Edge asks |
| "Error loading debug manifests" after stopping `fast-serve` | the debug query sticks to the tab (`sessionStorage`): open the page in a new tab without the query |
| `npm install` fails with `ERESOLVE` and `peerOptional @rspack/core@"0.x \|\| 1.x" from css-loader@7.1.2` | `npm install --save-dev css-loader@^7.1.4 <tarball>`, or `--legacy-peer-deps` / `legacy-peer-deps=true` in `.npmrc` (see [Install](#install)) |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` runs: stop it or use `--port` |
| `Unsupported SPFx version` | use the `spfx-fast-serve-helpers` line that matches your SPFx version |
| `No web parts, extensions or Adaptive Card Extensions found` | check `config/config.json` bundles (library components aren't served by themselves) |
| `<name> is an SPFx library project: run fast-serve in a consumer project` | link the library into a web part project and run `fast-serve` there (see [Library components](#library-components)) |
| a linked library still loads its deployed version | the link is a copy (pnpm/yarn `file:`), the package is listed in `deployedLibraries`, or its entry has no source under `src/` (warning at start) |
| `ReferenceError` for a webpack `DefinePlugin` constant, `Module not found` for a webpack alias | mirror the customization in `fast-serve/rspack.extend.mjs` |
| `… is the deprecated SharePoint Online workbench (retirement: December 1, 2026)` | set `initialPage` in `config/serve.json` (or `pageUrl`) to a page of your site |
| `<file> could not be loaded:` after editing the extend file | fix the file; the previous server keeps running and restarts when the file is fixed |
| stale or strange output after a dependency change outside the lock file (a linked package, a manual edit in `node_modules`) | delete `temp/fast-serve/cache` and start again |
| `<file> imports "<library>/lib/…", a deep import into the SPFx library <library>` | in that file, import from the library's root if it exports the name |

## Limitations

- Web parts, extensions and Adaptive Card Extensions are served; [library components](#library-components) only as linked source inside a consumer project.
- Dev server only: no production build, type checking or linting.
- `localhost` only; no Teams hosts.
- A webpack customization that replaces a heft built-in rule (for example SVGR for `.svg`) can't be mirrored one to one: the extend file adds rules, it doesn't edit `fast-serve`'s.
- A `const enum` from a dependency's declarations (Fluent `IconNames`) has no runtime value: use string values.

## Development

```sh
pnpm install
pnpm build        # TypeScript 7: Node code, browser runtimes and declarations into lib/
pnpm lint         # oxlint, type-aware
pnpm typecheck
pnpm test         # vitest: unit tests and real Rspack compiles against fixtures
```

License: MIT.
