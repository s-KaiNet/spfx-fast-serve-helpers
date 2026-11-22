# spfx-fast-serve-helpers

> **Beta.** `fast-serve` for SharePoint Framework **1.24.x** (Heft) projects, versions `1.24.0-beta.<n>`, published under the npm `beta` tag. From `1.24.0-beta.5` it is built on Rspack; the earlier 1.24 betas (up to `1.24.0-beta.3`) were built on Vite and are no longer developed (see [Migrating](#migrating)).

A dev-server-only replacement for `heft start`: it compiles your web parts, extensions and Adaptive Card Extensions with [Rspack](https://rspack.rs), serves them over HTTPS to a real SharePoint page, and applies edits with HMR and React Fast Refresh. SharePoint loads a few AMD bundles per page, like with heft, instead of one request per module. Production builds and packaging stay on Heft (`heft build`, `heft package-solution`).

Design and status: [research/HANDOFF.md](research/HANDOFF.md), plan [research/rspack/PLAN.md](research/rspack/PLAN.md), knowledge base [kb/index.md](kb/index.md).

## Requirements

- An SPFx **1.24.x** project (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`). `fast-serve` checks the installed SPFx version at start and exits with a message otherwise. For SPFx up to 1.21 use the classic [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve); 1.22 and 1.23 are not supported.
- Node.js 22 (from 22.14), 24 or 26, as SPFx 1.24.
- The SPFx development certificate, trusted once per machine (`npx heft trust-dev-cert`, the same one `heft start` uses).

## Install

Install the beta from npm:

```sh
npm install --save-dev spfx-fast-serve-helpers@beta
npx heft trust-dev-cert                     # once per machine
```

**npm `ERESOLVE` with `css-loader`:** a project with `css-loader` 7.1.2 or 7.1.3 (a direct devDependency, or locked at that version) fails with `ERESOLVE ... peerOptional @rspack/core@"0.x || 1.x" from css-loader@7.1.2`, because those versions don't accept Rspack 2. `css-loader` 7.1.4 and newer accept it, and SPFx's `@microsoft/sp-css-loader` (`~7.1.2`) works with them, so update it in the same command:

```sh
npm install --save-dev css-loader@^7.1.4 spfx-fast-serve-helpers@beta
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
[fast-serve] spfx-fast-serve-helpers 1.24.0-beta.15, SPFx 1.24.1
[fast-serve] ready in 1153 ms at https://localhost:4321
[fast-serve] ════════════════════════════════════════════════════════════════
[fast-serve]   To load your scripts, append this to your SharePoint page URL:
[fast-serve]   ?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true
[fast-serve] ════════════════════════════════════════════════════════════════
[fast-serve] type check: no errors
```

Append the query to your SharePoint page URL (replacing the page's own query), open it and click **Load debug scripts**. The query is printed unencoded so it is easy to read; browsers and SharePoint accept it as it is. A web part must already be on the page: add it from the toolbox while `fast-serve` runs and save the page. Stop the server with Ctrl+C.

Startup output is short on purpose: warnings and errors, the `rebuilt in …` line after each edit and the type-check and lint results are printed as they happen; the compiled bundles and components, the resolved options and the first compile time are not.

If the port is already taken (often a forgotten `fast-serve` or `heft start`), `fast-serve` names the process holding it and asks before doing anything:

```
[fast-serve] Port 4321 is in use by node (pid 12345): node node_modules/.bin/heft start
[fast-serve] Press Enter to stop it and continue, or Ctrl+C to cancel.
```

Enter stops that process (forcefully if it hasn't let go of the port after about 3 seconds) and starts normally; Ctrl+C exits without stopping anything. Without an interactive terminal (CI, scripts, piped output, coding agents) it never asks and never stops anything: it exits with the "port in use" error. It doesn't ask either when it can't identify the process (another user's process, no `lsof`/`ss` on Linux) or for its own parent process. Restarts while serving never ask.

All bundles are compiled before the server reports ready; later starts reuse a cache in `temp/fast-serve/cache` (see [Performance](#performance)). SCSS and static-asset typings (`temp/sass-ts`, `temp/static-asset-ts`) are checked right after the first compile and kept current while serving; a typing file is written only when its content changes (replaced in one step, so editors and type checkers never read half a file), and later starts skip unchanged stylesheets with a cache in `temp/fast-serve/sass-typings`.

### Extensions and serve configurations

Extensions load through the same query parameters `heft start` builds from `config/serve.json` `serveConfigurations`. Pick a serve configuration with `--config <name>` (`--serve-config` or `"serveConfiguration"` in `fast-serve/config.json` too) and `fast-serve` prints its extension query under the web-part query, unencoded except for spaces, `%`, `&`, `#` and `+`:

```
npm run serve -- --config commands
[fast-serve] ════════════════════════════════════════════════════════════════
[fast-serve]   To load your scripts, append this to your SharePoint page URL:
[fast-serve]   ?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true
[fast-serve]   To load the extensions of serve configuration "commands" too, use this instead:
[fast-serve]   ?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&noredir=true&loadSPFX=true&customActions={"…":{"location":"ClientSideExtension.ListViewCommandSet.CommandBar",…}}
[fast-serve] ════════════════════════════════════════════════════════════════
```

Append it to the configuration's page (a list view for Command Sets and Field Customizers, `_layouts/15/SPListForm.aspx` for Form Customizers). Without `--config`, `fast-serve` prints only the web-part query, even when `serveConfigurations.default` has extensions.

- `customActions` (Application Customizers, ListView Command Sets), `fieldCustomizers` and `formCustomizer` become `loadSPFX=true` plus the JSON parameters, or the form parameters (`componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties`). As in heft, `debug=true` is left out then.
- Page order (heft's, with the `pageUrl` option in place of heft's fallbacks): the selected configuration's `pageUrl` unless it is `default` → the `pageUrl` option → `serveConfigurations.default.pageUrl` → `initialPage`. `{tenantDomain}` is replaced with `SPFX_SERVE_TENANT_DOMAIN`. `fast-serve` doesn't print the page; it is passed to the extend file (`context.pageUrl`).
- Use a SharePoint page. Microsoft retires the SharePoint Online workbench (`/_layouts/workbench.aspx`, the `initialPage` the generator may write) on December 1, 2026.
- An unknown `--config` name warns with the available names and falls back to `default`. At start `fast-serve` warns about configurations that can't work: ids that aren't your extensions, a component of the wrong kind for its slot, unknown locations, the generator's placeholders (`InternalFieldName`, `/sites/mySite/Lists/MyList`).
- Editing `config/serve.json` restarts `fast-serve`; the box is printed again when the selected configuration changed.

### Adaptive Card Extensions

ACEs load with the web-part debug query on a SharePoint page, as in [Microsoft's ACE tutorial](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension): open your test page with it, edit the page and add the card from the toolbox. Card actions and quick views are disabled in edit mode: they work in read mode, on a saved page. `fast-serve` always prints the web-part debug query first, also when a serve configuration with extensions is selected.

Quick-view templates (JSON imports), images and the lazily loaded property pane (`import()` → `chunk.<name>.js`) come from the dev server; `@microsoft/sp-adaptive-card-extension-base` and the other SPFx libraries come from the page.

## Options

Zero config works. Precedence: command-line flags → `fast-serve/config.json` → `config/serve.json` (port, pages) → defaults (port `4321`, locale `en-us`, overlay on, type check on with its page panel, lint on).

```jsonc
// fast-serve/config.json (optional, JSON with comments)
{
  "$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json",
  "port": 4321,
  "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx",
  "locale": "en-us",
  "serveConfiguration": "default",
  "overlay": true,
  "deployedLibraries": [],
  "typeCheck": true,
  "typeCheckOverlay": true,
  "lint": true
}
```

The `$schema` line gives completion, descriptions and validation in VS Code and other editors. The schema ships in the package (`schema/config.schema.json`, JSON Schema draft-07); the path is relative to `fast-serve/config.json` and works with npm, pnpm and yarn when the package is a devDependency of the project (in a monorepo whose packages are hoisted to the root, adjust the number of `../`). `fast-serve` itself ignores `$schema`. VS Code treats `.json` as strict JSON: if you use comments, set `"files.associations": { "**/fast-serve/config.json": "jsonc" }`.

| Option | Flag | Meaning |
|---|---|---|
| `port` | `-p, --port` | HTTPS port on `localhost` |
| `pageUrl` | `--page-url` | your SharePoint test page; when set, the start-up box also prints the page with the debug query appended (`Or open: …`); passed to the extend file as `context.pageUrl` |
| `locale` | `--locale` | locale of the `localizedResources` strings, with a per-resource fallback to `en-us` |
| `serveConfiguration` | `--config`, `--serve-config` | `config/serve.json` serve configuration (default `default`) |
| `overlay` | `--no-overlay` | `false` turns off the error overlay over the page; errors still go to the terminal and the browser console |
| `typeCheck` | `--no-type-check`, `--type-check` | on by default: type checks the project in the background with its own TypeScript (≈1 GB of memory on large projects); `false` turns it off, see [Type checking](#type-checking) |
| `typeCheckOverlay` | `--no-type-check-overlay`, `--type-check-overlay` | on by default: also shows type errors in a panel at the bottom of the page (needs `typeCheck`); `false` keeps them in the terminal only |
| `lint` | `--lint`, `--lint full`, `--no-lint` | `true` (default) lints the files you save with the project's ESLint, without type-aware rules; `"full"` with them; `false` off, see [Linting](#linting) |
| `deployedLibraries` | (file only) | package names of [linked SPFx library projects](#library-components) to load from SharePoint (the deployed copy) instead of compiling their `src` |

An unknown key or a wrong type in `fast-serve/config.json` stops `fast-serve` with the list of supported keys and the `$schema` line. The nested `"serve": { … }` object of [classic spfx-fast-serve](#migrating) is not supported: `fast-serve` stops and asks for the flat format. `amdPackages` (an option of the Vite-based betas) is ignored with a warning. `config/fast-serve.json` from early betas is not read (a warning asks to move it). HTTPS is always on, with the SPFx development certificate.

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

## Serving through a tunnel

For places where the debug query can't be used (Viva Connections and Teams on mobile, device-only bugs), `fast-serve` can serve a **deployed development package** through a tunnel you run yourself, like classic fast-serve's `NgrokServePlugin`. `fast-serve` doesn't start or manage the tunnel. The debug query can't point to a tunnel: SharePoint accepts `debugManifestsFile` only on `localhost`.

1. **Start a tunnel with a fixed host name** that forwards to `https://localhost:<port>` (the tunnel must not verify the dev certificate), for example:
   - Microsoft Dev Tunnels: `devtunnel host -p 4321 --protocol https --allow-anonymous` (persistent tunnel id);
   - a named Cloudflare Tunnel on your own domain, or `cloudflared tunnel --url https://localhost:4321 --no-tls-verify` (quick tunnel: new host on every start);
   - ngrok **paid plan** with a fixed domain: `ngrok http https://localhost:4321 --domain <host>`.
2. **Point the development package at the tunnel:** in `config/serve.json` set `"hostname": "<tunnel host>"` and `"port": 443`.
3. **Build and deploy a development package once:** `heft build` and `heft package-solution` (both **without** `--production`), then upload `sharepoint/solution/*.sppkg` to the app catalog. Its manifests load the bundles from `https://<tunnel host>:443/dist/`.
4. **Add the plugin** to `fast-serve/rspack.extend.mjs`:
   ```js
   import { defineConfig, TunnelServePlugin } from 'spfx-fast-serve-helpers';

   export default defineConfig(() => ({ plugins: [new TunnelServePlugin({ host: 'my-tunnel.example.com' })] }));
   ```
   `host` is the host name only (no `https://`, port or path); anything else is ignored with a warning.
5. **Run `fast-serve`** (same port as the tunnel target) and open the page **without** the debug query, in a tab that never used it (the debug query sticks to the tab). Instead of the debug-query box, `fast-serve` prints `ready in … at https://<host> (tunnel mode; your tunnel forwards to https://localhost:<port>)` and one line reminding you to open the page without the query.

In tunnel mode `fast-serve` still listens on `https://localhost:<port>`, but everything the page sees uses `https://<host>`: chunk and asset URLs, `manifests.js` base URLs, the HMR websocket (`wss://<host>:443`), browser-error forwarding and local-file externals. It also answers the file names heft's development package uses (strings scripts such as `dist/HelloWorldWebPartStrings_en-us.js`, content-hashed local externals); string edits still hot-update through the bundled copy. Bundles are sent with `Cache-Control: no-store`, and each bundle clears the tunnel's responses from SharePoint's `Site-*` caches (the mobile apps cache scripts). The overlay and terminal error forwarding run inside the bundles, so they work without `manifests.js`. The ready line shows the tunnel origin and there is no debug query; the localhost debug-query flow doesn't work in tunnel mode (its scripts would come from the tunnel host). Remove the plugin to go back. The extend-file context (`origin`, `publicPath`) still describes `localhost`, because the plugin is read from that file.

Risks and limits:
- **Free ngrok doesn't work:** its warning page answers script requests with HTML. Use a paid ngrok plan, Dev Tunnels or a named Cloudflare tunnel.
- **Your dev server is public** while the tunnel runs: anyone with the URL can read the bundles and source maps. Stop the tunnel when you're done and never deploy the development package to a production app catalog.
- You need **app catalog rights**, and the development package replaces the deployed app with the same id. If SharePoint blocks the scripts, add the tunnel origin to the tenant's trusted script sources (exact host).
- **Rebuild and redeploy** the package when the tunnel host changes (quick tunnels: every start) or when manifests change (new components, new SPFx library or `config.json` external, changed `config/config.json`); code edits don't need it.
- The package's manifests are heft's, not `fast-serve`'s: a bundle dependency heft loads differently isn't listed (an ACE whose property pane imports `@microsoft/sp-property-pane` lists it on `fast-serve`'s bundle but not in heft's ACE manifest; not checked on a tenant yet).

## HMR

| Edit | Result |
|---|---|
| `.tsx`/`.ts` module whose exports are all React components | hot update, state kept (Fast Refresh) |
| `.module.scss` / `.scss` / `.css` | styles swapped without a reload |
| loc file used only by components | hot update |
| web part / extension / ACE class, what only it imports (services, ACE card and quick views, templates), loc files the class imports | page reload |
| a module that exports components **and** other values (hooks, constants) | page reload |
| a new import of an SPFx library or `config.json` external, or an edit of a local-file external | page reload (a bundle's AMD dependency list is fixed when it loads) |
| a syntax error and its fix in a component that is the only user of a library (`escape` from `@microsoft/sp-lodash-subset`) | error overlay, then hot updates again with state kept (before `1.24.0-beta.8`: `escape is not a function` on the next edit) |
| `package.json`, `config/*.json`, `fast-serve/config.json`, tsconfig, manifests, the extend file (also a linked library's) | `fast-serve` restarts (≈0.1–0.5 s) and open pages reload by themselves |
| a linked library's component, styles, loc strings | same as your own files (see [Library components](#library-components)) |

Several bundles on one page all hot-update. Keep setup (icons, PnPjs, listeners) in `onInit`, not at module level: module code runs again on every hot update. A background tab delays Fast Refresh up to a second (browser timer throttling).

## Errors

- **Compile errors and warnings** go to the terminal with project-relative paths and a code frame (`error in src/…` and `rebuilt in 46 ms (src/…): 1 error`) and to one overlay over the page; the next successful rebuild closes it. A rebuild that changes no module output (a file saved without changes) prints nothing unless the errors or warnings changed.
- **Runtime errors from your code** (uncaught errors, unhandled rejections, `console.error` with a frame in your code) are forwarded to the terminal, source-mapped to `src/…:line` with a code frame; uncaught ones also open the overlay, `console.error` calls don't (your code may log errors it handles). The next successful rebuild with new output (also one with only warnings) closes it; if the updated code throws again, it opens again. Esc, × or a click outside closes it too. SharePoint's own errors stay in the browser console.
- **Code that throws while a module runs** (for example a stray `asdf` after an import line, which compiles but fails with `ReferenceError`) opens the overlay too. During a hot update the page keeps showing the previous version of the component until the error is fixed, and the terminal says so. At page load the bundle can't load: the web part's error box shows the reason and the page reloads after the fix.
- **Render errors** (for example a misspelled function in JSX, `{escape1(…)}`, in a class or function component) open the overlay and the terminal names the line, both after a hot update and after F5. Without [type checking](#type-checking) such typos show up only when the code runs; React unmounts the failing web part's content until the fix, which renders it again without a reload.
- **A bundle that fails to load** shows a readable reason in the web part's error box instead of `[object Object]` (compile error, code that threw while loading, missing `config.json` external or SPFx library), and the page reloads after the fix.
- `--no-overlay` / `"overlay": false` turns the overlay off; terminal and console still get everything.

## Type checking

`fast-serve` compiles TypeScript with SWC, file by file, without type information. A background type check shows type errors while you work; it's on by default, with a panel on the page. Turn it off when you don't need it or memory is short (≈1 GB on large projects):

```sh
npx fast-serve --no-type-check-overlay   # type errors in the terminal only
npx fast-serve --no-type-check           # no type check
```

or `"typeCheckOverlay": false` / `"typeCheck": false` in `fast-serve/config.json` (`--type-check` and `--type-check-overlay` turn them on again for one run). A project without `tsconfig.json` or TypeScript starts as usual with one `type check is off: …` line.

- **Same TypeScript as `heft build`:** the check runs the project's own TypeScript (5.8 in SPFx 1.24, found in the project or the SPFx build rig) on the project's unchanged `tsconfig.json`, so it reports what heft's TypeScript step reports for the project's files. It runs in two worker processes ([ts-checker-rspack-plugin](https://github.com/rstackjs/ts-checker-rspack-plugin)) and never blocks a rebuild or a hot update: the page updates as usual while the check runs.
- **Terminal:** the first result after the start, then a block only when the set of errors changes (`type error in src/…/Second.tsx:11:30`, `TS2552: Cannot find name 'escape1'…`, a code frame, then `type check: 1 error`), and `type check: no errors` once when it's clean again. At most 20 errors are listed. Type errors never show up as compile errors, in `rebuilt in …` lines or in the compile error overlay. A file with a syntax error is the compiler's: its compile error is shown and the check leaves that file out until it builds again (no `TS1005: '}' expected` next to SWC's `Expected '}'`). Syntax errors in type-only files (interfaces, which the compiler never sees) still come from the check.
- **Overlay** (`typeCheckOverlay`): a panel at the bottom of the page, separate from the compile and runtime error overlay; it closes when the check is clean; Esc or × hides it until the errors change. While the compile or runtime error overlay is open, the panel shrinks to one line (`[fast-serve] Type check: 1 error (also shown in the terminal)`); click it to see the errors; when that overlay closes, the panel comes back. It comes with the debug `manifests.js`, so there is no panel in [tunnel mode](#serving-through-a-tunnel).
- **Type-only files** (interfaces, `import type`): saving one re-checks without a `rebuilt` line. SCSS and asset typings written by `fast-serve` are passed to the next check, so a new stylesheet class or image doesn't leave a stale `Cannot find module` error.
- **Timing** (2-core laptop): the first result arrives ≈4 s after the start on a small project and ≈5.5 s on a 1000-module project (≈10 s the first time, before `temp/fast-serve/typecheck.tsbuildinfo` exists); after a restart ≈3.3 s / ≈4.5 s; an error in a component ≈0.3–0.5 s after the save; a change to a type used everywhere ≈6 s on the big project. Rebuilds get ≈70 ms slower on the big project while the check runs (shared CPU); the first start of the process ≈0.2 s slower (TypeScript is loaded once to check its version).
- **Memory:** the two workers need ≈0.7–0.8 GB after the first check, up to ≈1.2 GB after edits to widely used types on large projects. If that's too much, use `--no-type-check` (or `"typeCheck": false`) and rely on `heft build`.
- **Scope:** only the project you run `fast-serve` in. [Linked library projects](#library-components) are compiled from source but checked against their built declarations, like the project's own tsconfig sees them; run their own `heft build` for their errors. A `TsCheckerRspackPlugin` (or `ForkTsCheckerWebpackPlugin`) in `fast-serve/rspack.extend.mjs` replaces `fast-serve`'s check (its output and options apply).
- **Not a build:** it doesn't lint (see [Linting](#linting)), doesn't emit files (only its own incremental info) and doesn't replace `heft build` before packaging.

## Linting

`fast-serve` lints the files you save with the project's own ESLint and `eslint.config.js` (the config SPFx 1.24 generates), in the background, and prints what it finds in the terminal. It's on by default:

```sh
npx fast-serve               # lint saved files, type-aware rules off (default)
npx fast-serve --lint full   # with type-aware rules, like heft build
npx fast-serve --no-lint     # no linting
```

or `"lint": true | "full" | false` in `fast-serve/config.json`.

- **What is linted:** only `.ts`, `.tsx`, `.js` and `.jsx` files under `src` that you save while `fast-serve` runs, including type-only files that aren't in a bundle (interfaces, `import type` targets). Files the config ignores are skipped. Nothing is linted at start; heft's lint step still lints the whole project.
- **Terminal:** after the `rebuilt` line, one block per saved file when its findings change: `lint: src/…/Second.tsx: 1 error, 2 warnings`, then one line per finding (`line:column`, severity, message, rule id), at most 20 per file. A file that becomes clean prints `lint: src/…/Second.tsx: clean` once. Saving without changing the findings prints nothing. ESLint errors are labelled `error`, but they are lint output: they never count as compile errors, never appear in the `rebuilt` line or the overlay, and never block a rebuild or a hot update. A file that doesn't parse is left to the compile error.
- **Default: type-aware rules off.** Rules that need type information are turned off (typescript-eslint's `disable-type-checked` for TypeScript files, and any other rule that declares it needs types or fails without them). In the SPFx config that's two rules, `@typescript-eslint/no-floating-promises` and `@typescript-eslint/no-for-in-array`; both are **errors**, so `heft build` can still fail on them although `fast-serve` showed nothing. Everything else matches heft's lint step exactly. Use `"lint": "full"` for exact parity (the project's config as is: a TypeScript program in the lint process, a slower first lint and more memory).
- **React hooks:** the SPFx config registers the `react-hooks` plugin but turns none of its rules on, so neither `heft build` nor `fast-serve` reports hook mistakes. Turn them on in `eslint.config.js` if you want them.
- **How it runs:** in one separate process with the project's ESLint 9 (from the project or the SPFx rig), started right after the first compile so the first save is fast; it lints only after a rebuild is done, so hot updates aren't delayed. ESLint's cache lives in `temp/fast-serve/eslint`. Editing `eslint.config.js` reloads ESLint; restarts and Ctrl+C stop the process.
- **Timing and memory** (2-core laptop, save → lint block): ≈0.1–0.15 s on a small project and ≈0.15 s on a 1000-module project, including the first save (≈0.2 s) when the background start has finished (≈1.3 s after "ready"); with `"full"` the same per save, but the background start takes ≈3.6–4.5 s. No measurable effect on rebuild times, except a save in the first seconds after "ready" while the lint process starts (≈+0.05–0.1 s once). The process needs ≈230–250 MB, ≈530–640 MB with `"full"`.
- **Linked library projects** are linted with their own `eslint.config.js` and ESLint (same process); a library without them isn't linted (one info line).
- **Stays off** with one info line (`lint is off: …`) when the project has no `eslint.config.js` / `.mjs` / `.cjs`, no ESLint, or ESLint older than 9 (legacy `.eslintrc`). An `ESLintRspackPlugin`/`ESLintWebpackPlugin` in `fast-serve/rspack.extend.mjs` replaces `fast-serve`'s lint.

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
- Type checking while serving is on by default ([`--no-type-check`](#type-checking) turns it off); [linting](#linting) covers the files you save, without type-aware rules unless `"lint": "full"`.
- A heft webpack customization needs its development counterpart in `fast-serve/rspack.extend.mjs`.
- React and react-dom are bundled from the project in their development build (heft declares them as externals that the page provides); Fast Refresh needs that.
- The Field Customizer on our test tenant is never instantiated by SharePoint, with `heft start` too.

**From classic spfx-fast-serve (SPFx ≤ 1.21):** its `fast-serve/config.json` nests the options in a `"serve"` object with a `$schema` URL; `fast-serve` stops with "outdated classic spfx-fast-serve format". Replace the file with flat options and the shipped schema: `"$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json"`, `port` → `port`, `openUrl` → `pageUrl`, `locale` → `locale`, `config` → `serveConfiguration`, `fullScreenErrors` → `overlay`, `eslint` → `lint`; `memory`, `isLibraryComponent`, `loggingLevel`, `hotRefresh`, `reactProfiling`, `containers` and `debug` have no counterpart (HMR, Fast Refresh and library projects work without options). The classic `fast-serve/webpack.extend.js` becomes `fast-serve/rspack.extend.mjs` ([Customizing the Rspack config](#customizing-the-rspack-config)).

**From the Vite-based betas (up to `1.24.0-beta.3`):** same CLI, options and `fast-serve/config.json`. Replace `fast-serve/vite.extend.mts` with `fast-serve/rspack.extend.mjs` (Rspack/webpack config instead of Vite config; `define` → `rspack.DefinePlugin`, `resolve.alias` stays). `amdPackages` is ignored: Rspack bundles AMD/UMD dependencies itself. Differences you will notice: the server compiles everything before "ready" (Vite compiles on request), a page loads a few bundles instead of one request per module, `require()` and `const enum` across files follow webpack, and errors use `fast-serve`'s own overlay.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `No valid SPFx development certificate found` | `npx heft trust-dev-cert` |
| "Error loading debug manifests" | `fast-serve` isn't running, or the browser doesn't trust the certificate (trust it and restart the browser); allow access to local network devices if Chrome/Edge asks |
| "Error loading debug manifests" after stopping `fast-serve` | the debug query sticks to the tab (`sessionStorage`): open the page in a new tab without the query |
| an Application Customizer, Command Set, Field or Form Customizer doesn't load with the printed query | the short query loads web parts and ACEs only: run `fast-serve --config <serve configuration>` and use the second query in the box on that configuration's page |
| `npm install` fails with `ERESOLVE` and `peerOptional @rspack/core@"0.x \|\| 1.x" from css-loader@7.1.2` | `npm install --save-dev css-loader@^7.1.4 spfx-fast-serve-helpers@beta`, or `--legacy-peer-deps` / `legacy-peer-deps=true` in `.npmrc` (see [Install](#install)) |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` runs: run `fast-serve` in a terminal and press Enter to stop it, stop it yourself, or use `--port` |
| `Could not stop … (pid …)` or `The process holding the port could not be identified` | the process belongs to another user or can't be seen without admin rights: stop it yourself (`kill <pid>`, Task Manager) or use `--port` |
| `Unsupported SPFx version` | use the `spfx-fast-serve-helpers` line that matches your SPFx version |
| `uses the outdated classic spfx-fast-serve format` | replace `fast-serve/config.json` with the flat options and the shipped schema (see [Migrating](#migrating)) |
| `fast-serve/config.json: unknown option or wrong type "<key>"` | fix the key; add the printed `$schema` line so the editor flags such keys while you type |
| `No web parts, extensions or Adaptive Card Extensions found` | check `config/config.json` bundles (library components aren't served by themselves) |
| `<name> is an SPFx library project: run fast-serve in a consumer project` | link the library into a web part project and run `fast-serve` there (see [Library components](#library-components)) |
| a linked library still loads its deployed version | the link is a copy (pnpm/yarn `file:`), the package is listed in `deployedLibraries`, or its entry has no source under `src/` (warning at start) |
| `ReferenceError` for a webpack `DefinePlugin` constant, `Module not found` for a webpack alias | mirror the customization in `fast-serve/rspack.extend.mjs` |
| `<file> could not be loaded:` after editing the extend file | fix the file; the previous server keeps running and restarts when the file is fixed |
| stale or strange output after a dependency change outside the lock file (a linked package, a manual edit in `node_modules`) | delete `temp/fast-serve/cache` and start again |
| a SCSS typing in `temp/sass-ts` looks out of date | save the stylesheet, or delete `temp/fast-serve/sass-typings` and start again (every stylesheet is then compiled once more) |
| `type check is off: …` at start | the project has no `tsconfig.json` or TypeScript (fine for a JavaScript project), its TypeScript isn't installed (`npm install`), or it is TypeScript 7 (the check needs the compiler API of TypeScript 5) |
| `type check stopped: …` | a type check worker failed (often out of memory on very big projects): restart `fast-serve`, or run with `--no-type-check` and use `heft build` |
| type errors in the terminal but the page works | expected: type errors don't stop rebuilds or hot updates; fix them before `heft build` |
| a type error stays although the file is fixed | save the file once more; if a generated typing (`temp/sass-ts`, `temp/static-asset-ts`) is involved, save the stylesheet or image, or restart `fast-serve` |
| `lint is off: …` at start | the project has no `eslint.config.js` (`.mjs`, `.cjs`), its ESLint isn't installed (`npm install`), or it is older than ESLint 9 |
| `lint: ESLint could not load eslint.config.js …` | fix the config (run `npx eslint <file>` for details); linting starts again when the file changes |
| `lint stopped: the ESLint process exited …` | restart `fast-serve`; if it happens again run `npx eslint <file>` to see why, or use `--no-lint` |
| `heft build` fails with `no-floating-promises` or `no-for-in-array` but `fast-serve` showed no lint error | expected with the default: type-aware rules are off while serving; use `"lint": "full"` |
| no type check panel on the page | the panel appears only while there are type errors; check that neither `typeCheck` nor `typeCheckOverlay` is `false` (or `--no-type-check…`) |
| a one-line `Type check: …` bar at the bottom of the error overlay | expected: the type panel collapses while a compile or runtime error overlay is open; click it to expand |
| `<file> imports "<library>/lib/…", a deep import into the SPFx library <library>` | in that file, import from the library's root if it exports the name |

## Limitations

- Web parts, extensions and Adaptive Card Extensions are served; [library components](#library-components) only as linked source inside a consumer project.
- Dev server only: no production build. The [type check](#type-checking) covers the project you serve, not linked library projects; [linting](#linting) covers only the files you save.
- The debug query works on `localhost` only; Teams and mobile hosts need [tunnel mode](#serving-through-a-tunnel) with a deployed development package.
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

The Vite implementation of the earlier betas is kept on branch `vite` for history; it is no longer developed.

License: MIT.
