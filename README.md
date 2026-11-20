# spfx-fast-serve-helpers

> **Work in progress.** Vite-based rewrite for SharePoint Framework **1.24.x** (Heft) projects.

A dev-server-only replacement for `heft start`: the server starts fast, HMR with React Fast Refresh works, and your web parts, extensions and Adaptive Card Extensions run inside a real SharePoint page. Production builds and packaging stay on Heft (`heft build` / `heft package-solution`).

Design notes, decisions and status: [research/HANDOFF.md](research/HANDOFF.md).

## Requirements

- An SPFx **1.24.x** project (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`). The package version follows the SPFx version, as in the classic spfx-fast-serve: `spfx-fast-serve-helpers@~1.24.0` serves SPFx 1.24.x. For SPFx up to 1.21 (gulp/webpack), use [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve) with the matching `spfx-fast-serve-helpers@~1.21.0` (or earlier). SPFx 1.22 and 1.23 are not supported. `fast-serve` checks the installed SPFx version at start and exits with a message if it doesn't match.
- Node.js versions supported by SPFx 1.24: 22 (from 22.14), 24 or 26.
- The SPFx development certificate, trusted once per machine (the same one `heft start` uses).

## Migrating

From `heft start` (SPFx 1.22+) or from the classic spfx-fast-serve (SPFx 1.21 and earlier): [research/migration.md](research/migration.md), including what's different in development.

## Install

```sh
npm install --save-dev spfx-fast-serve-helpers@~1.24.0     # or: pnpm add -D spfx-fast-serve-helpers@~1.24.0
npx heft trust-dev-cert                                    # once per machine
```

It installs with plain `npm install`, no `--legacy-peer-deps`, next to SPFx's default Jest/Babel 7 dependencies. Vite and `@vitejs/plugin-react` are regular dependencies of this package, so you don't need to add them to your project. React and react-dom always come from your project's `node_modules`, in their development build (Fast Refresh needs it).

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

It prints the page to open, e.g.

```
[fast-serve] ready in 340 ms at https://localhost:4321
[fast-serve] web parts: HelloWorldWebPart
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
```

Open that URL and click **Load debug scripts**. If no page is configured, append the printed query to any SharePoint page URL (in place of the page's own query): `?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true`. The web part must already be on the page (add it from the toolbox while `fast-serve` runs, then save the page).

Web parts, extensions (Application Customizers, ListView Command Sets, Field Customizers, Form Customizers) and Adaptive Card Extensions are served; library components are not yet. Stop the server with Ctrl+C.

The server is ready at once: dependencies are pre-bundled in the background, and your files are compiled when the page first requests them (nothing is compiled ahead), so the first page load after a start takes longer than the next ones. The SCSS typings in `temp/sass-ts` are regenerated right after the server starts listening.

### Adaptive Card Extensions

ACEs load with the same debug query as web parts, so nothing needs configuring. As in Microsoft's [ACE tutorial](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension): open a test SharePoint page with the printed query, edit it and add the card from the toolbox (it's listed under its manifest title). Card interaction (buttons, quick views) is disabled in edit mode: save the page and use it in read mode.

`@microsoft/sp-adaptive-card-extension-base` comes from the page like every SPFx library. Quick view templates (`import template from './template/QuickViewTemplate.json'`, or `require(...)`) and images (`import logo from '../assets/logo.png'`) are served by Vite. Card views and quick views are classes the ACE registers in `onInit`, so editing them, their JSON templates or the ACE class reloads the page ([details](research/hmr.md#adaptive-card-extensions)).

### Extensions and serve configurations

Extensions are loaded through query parameters, the same ones `heft start` uses. They come from the `serveConfigurations` in `config/serve.json`, which the SPFx generator writes for every extension:

```jsonc
"serveConfigurations": {
  "default": {
    "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/home.aspx",
    "customActions": {
      "f1e9c965-12f5-4beb-9103-7640ed381a72": { "location": "ClientSideExtension.ApplicationCustomizer", "properties": { "testMessage": "Hello" } }
    }
  },
  "rating": {
    "pageUrl": "https://{tenantDomain}/sites/dev/Lists/Tasks/AllItems.aspx",
    "fieldCustomizers": { "Title": { "id": "21fe7eba-88c8-4a4b-ad68-52b7d32f1607", "properties": { "sampleText": "Value" } } }
  },
  "feedback_EditForm": {
    "pageUrl": "https://{tenantDomain}/sites/dev/_layouts/15/SPListForm.aspx",
    "formCustomizer": { "componentId": "29b61138-a710-4379-b616-98f496c16e4f", "PageType": 6, "RootFolder": "/sites/dev/Lists/Tasks", "ID": 1 }
  }
}
```

`fast-serve` uses `default`, or the one you pick with `--config <name>` (`--serve-config` works too, like in heft), and prints its page with the query:

```
npm run serve -- --config rating
[fast-serve] serve configuration: rating
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/Lists/Tasks/AllItems.aspx?debugManifestsFile=…&noredir=true&loadSPFX=true&fieldCustomizers=%7B%22Title%22…
```

- `customActions` (Application Customizers, Command Sets), `fieldCustomizers` and `formCustomizer` become `loadSPFX=true` plus `customActions=<json>`, `fieldCustomizers=<json>`, or the form parameters (`componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties=<json>`). As in heft, `debug=true` is left out then: the list pages fail to load the debug scripts with both.
- The page is chosen like in heft, with the `pageUrl` option (`--page-url`, then `fast-serve/config.json`) in the place of heft's fallback pages:
  1. `pageUrl` of the configuration picked with `--config` (other than `default`);
  2. the `pageUrl` option;
  3. `serveConfigurations.default.pageUrl`;
  4. `initialPage`.

  So `--config commands` opens the list page of `commands` even when `fast-serve/config.json` sets a `pageUrl`, and a configuration without a `pageUrl` (or `default`) uses the option. `{tenantDomain}` works as everywhere.

  Use a SharePoint page: Microsoft retires the SharePoint Online workbench (`/_layouts/workbench.aspx`, the `initialPage` the generator may write) on December 1, 2026, so `fast-serve` warns about a page URL that points to it and ignores it.
- As in heft, the debug parameters replace the page URL's own query (`?…`); a `#hash` is kept.
- An unknown `--config` name prints a warning with the available names and falls back to `default`, like heft.
- At start `fast-serve` warns about configurations that don't fit the project: an id that isn't one of your extensions, a field customizer used as a command set, the generator's placeholders (`InternalFieldName`, `/sites/mySite/Lists/MyList`).
- The configuration is read at start: restart `fast-serve` after editing `serve.json` to get the new URL.

### Options

Zero config works. Options, by precedence:

1. command-line flags: `fast-serve --port 4400 --page-url https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx --locale de-de --config rating`
2. `fast-serve/config.json` (optional, JSON with comments; like the classic spfx-fast-serve, all `fast-serve` files of a project live in its `fast-serve/` folder):
   ```json
   { "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us", "serveConfiguration": "default" }
   ```
3. SPFx defaults: `config/serve.json` `port` and pages, then port `4321` and locale `en-us`.

The page is the exception: a named serve configuration's own `pageUrl` wins over the `pageUrl` option, which wins over `serveConfigurations.default.pageUrl` and `initialPage` (see [Extensions and serve configurations](#extensions-and-serve-configurations)).

| Option | Flag | Meaning |
|---|---|---|
| `port` | `-p, --port` | HTTPS port on `localhost` |
| `pageUrl` | `--page-url` | page printed with the debug query, unless the selected serve configuration (other than `default`) has its own `pageUrl`. `{tenantDomain}` is replaced with the `SPFX_SERVE_TENANT_DOMAIN` environment variable (e.g. `contoso.sharepoint.com`) |
| `locale` | `--locale` | locale of `localizedResources` strings (falls back to `en-us` per resource) |
| `serveConfiguration` | `--config`, `--serve-config` | `config/serve.json` `serveConfigurations` entry to use (default: `default`); an unknown name warns with the list of names and uses `default` |
| `overlay` | `--no-overlay` | `false` turns off the error overlay over the page (see [Errors](#errors)); errors still go to the terminal and the browser console (default: `true`) |
| `amdPackages` | | `fast-serve/config.json` only: packages from `node_modules` that keep SharePoint's RequireJS `define()` (see [require() and AMD in dependencies](#require-and-amd-in-dependencies)), e.g. `["legacy-amd-plugin"]`. Restart `fast-serve` after changing it (default: `[]`) |

HTTPS is always on, with the SPFx development certificate. There is no `vite.config` to write: `fast-serve` configures Vite itself. A project that customizes heft's webpack config can add the development counterpart in `fast-serve/vite.extend.mts` (see [Customizing the Vite config](#customizing-the-vite-config)).

`config/fast-serve.json` (used by early betas) is not read: `fast-serve` prints a warning asking to move it to `fast-serve/config.json`.

### config.json externals

`config/config.json` `externals` (URLs and local files, with `globalName`/`globalDependencies`) are loaded by SharePoint's RequireJS like in heft, never bundled from `node_modules`. Imports from them behave like heft's webpack output, without reading anything from an installed package:

- `import { render } from 'ejs'`: reads `render` from the loaded module when your module runs (`undefined` if the script doesn't define it);
- `import * as ejs from 'ejs'`: the module object exactly as RequireJS returns it, so a function or class (`new apexcharts(...)`) works when the script returns one;
- `import ApexCharts from 'apexcharts'`: `module.default` when the module has `__esModule`, otherwise the module itself;
- `export { render } from 'ejs'` and `export * as ejs from 'ejs'` work; `export * from 'ejs'` can't know the names (they only exist at runtime), so `fast-serve` warns: re-export the names you need;
- `await import('ejs')` gives a webpack-like namespace: the module's properties plus `default`.

A script that defines nothing (it returns `undefined`) loads without errors; only reading a name from it fails.

### require() and AMD in dependencies

On a SharePoint page the global `require` and `define` belong to SharePoint's RequireJS. Heft's webpack handles both at build time; `fast-serve` serves ES modules, so it rewrites them where webpack would have handled them:

- **`require('<string>')` in your code** becomes an import, and the call gives what webpack's `require` gives:
  - relative paths and `tsconfig` `paths` aliases: the module (namespace), JSON data, or the URL of an asset;
  - packages (`require('dayjs')`, `require('@microsoft/mgt-components/dist/es6/components/mgt-person/mgt-person')`): `module.exports` of a CommonJS package, the namespace of an ES module package; `require('pkg/data.json')` gives the data and `require('pkg/icon.svg')` a URL;
  - SPFx libraries (`@microsoft/sp-*`) and `config/config.json` externals: the module exactly as RequireJS returns it;
  - `require('x');` on its own runs the module for its side effects.

  `require(variable)`, `require.resolve`, `require.context`, `require.ensure`, `typeof require` and a `require` that is a parameter or variable of your code are left as is; a computed `require(name)` prints a warning (use `import()` for modules chosen at runtime). One difference remains: imports run before the code of the module, so a `require` placed after other statements runs before them, while webpack runs it in place. The generated imports go after your own imports, so the order among dependencies is the same.
- **AMD in dependencies:** UMD libraries that check for AMD before CommonJS (the full `lodash` build, some older moment builds and bundles from older tooling) would call SharePoint's `define()` from inside `node_modules` code: RequireJS throws "Mismatched anonymous define() module" (with a stack pointing at an unrelated module) and the import gives `{}`. `fast-serve` hides the global `define` from dependency code, in pre-bundled dependencies and in files served from `node_modules`, so these libraries take their CommonJS or ES module branch as under webpack. Your `src` code and `config/config.json` externals still see RequireJS. A package that really must register with SharePoint's RequireJS can keep `define` through `"amdPackages": ["package-name"]` in `fast-serve/config.json`. If the error still shows up, the terminal adds a hint where to look.

### TypeScript settings, static assets and theme colors

- **`paths` aliases.** `compilerOptions.paths` and `baseUrl` in `tsconfig.json` (including the files it `extends`) resolve imports in `src` the way `tsc` does: exact keys first, then the longest matching wildcard, targets in order, then `baseUrl`, then `node_modules`. Editing `tsconfig.json` (or a file it extends inside the project) reloads the page with the new aliases. `require('@alias/logo.png')` through an explicit `paths` key works like a relative `require` (a catch-all `"*"` key or `baseUrl` alone doesn't make a `require()` an alias).
- **Decorators and class fields.** The `tsconfig.json` compiler options that change emitted code are applied the way `tsc` applies them: `experimentalDecorators`, `emitDecoratorMetadata`, `useDefineForClassFields`, `target`, `strict`, `strictNullChecks` (read through `extends`, so the SPFx rig's `experimentalDecorators: true` and `target: "es5"` apply). Legacy class, method, property and parameter decorators work, and a class field without an initializer isn't emitted, so it doesn't reset a value set by the base class. Nothing else is downleveled. Changing one of these options restarts the dev server. With `emitDecoratorMetadata`, import interfaces and types from other files with `import type`: a plain `import { ILogger }` used only as a parameter type stays in the compiled code. `fast-serve` removes such names from the served code when the target module doesn't export them at runtime (their metadata becomes `Object`, as with `tsc`) and prints a warning with the `import type` fix. Metadata for primitive types (`string`, `number`, ...) can differ from `tsc`; class tokens, which DI containers use, are the same.
- **Static assets.** `import logo from './assets/logo.png'` (or `require('./assets/logo.png')`) gives an absolute URL on the dev server, e.g. `https://localhost:4321/src/webparts/hello/assets/logo.png`. Typings come from the SPFx build rig: Heft's `static-asset-typings` task writes `temp/static-asset-ts/**/*.d.ts` for the extensions in the rig's `config/static-asset-typings.json` (`.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`), and the rig's `tsconfig` reads them through `rootDirs`. `fast-serve` writes the same files when it starts and when you add an asset, so new assets are typed without a `heft build`. For other extensions (e.g. `.woff`, `.mp4`) add your own declaration, exactly as `heft build` needs it:
  ```ts
  declare module '*.mp4' {
    const url: string;
    export default url;
  }
  ```
  TypeScript finds these typings for relative imports only (through `rootDirs`). To type assets imported through a `paths` alias, add the typings folder as a second target; `fast-serve` uses the first target that exists:
  ```json
  "paths": { "@assets/*": ["./src/assets/*", "./temp/static-asset-ts/assets/*"] }
  ```
- **Sass deprecations.** `silenceDeprecations` from `config/sass.json` (merged through `extends` with the SPFx rig, whose default silences `mixed-decls`, `import`, `global-builtin` and `color-functions`) applies to the Sass compiler like in heft, so the `@import` warnings of Fluent UI's `References.scss` aren't printed. Without the setting nothing is silenced. Editing `config/sass.json` restarts the dev server. The other `config/sass.json` settings are used for the typings in `temp/sass-ts` only.
- **Sass `pkg:` URLs.** `@use`, `@forward` and `@import` with `pkg:` URLs (e.g. `@import 'pkg:@fluentui/react/dist/sass/References.scss';`) work, also inside packages, resolved like Sass's Node package importer from the Sass package Vite compiles with (`sass-embedded` or `sass` 1.71+; older versions don't support `pkg:`). That importer follows the package's `exports`, `sass` and `style` fields, while heft looks the path up in the file system, so a bare `pkg:name` import (without a file path) can resolve to a different file than in `heft build`. `~` imports (`@import '~@fluentui/react/dist/sass/References.scss';`) keep working.
- **Theme colors.** `"[theme:themePrimary, default: #0078d4]"` tokens in your styles resolve to the page theme when a stylesheet is inserted or hot-updated. Switching the site theme while the page is open does not recolor them: reload the page.

## Customizing the Vite config

`fast-serve` never runs webpack, so a heft webpack customization (`config/spfx-customize-webpack.js`, or `config/webpack-patch.json` with its patch files) doesn't apply to it: `DefinePlugin` constants are `ReferenceError`s, aliases don't resolve, loaders for extra file types are missing. If those customizations matter in development, mirror them in **`fast-serve/vite.extend.mts`**, the counterpart of the classic `fast-serve/webpack.extend.js`. It is optional: without it nothing changes.

```ts
import path from 'node:path';
import { defineConfig } from 'spfx-fast-serve-helpers';
import { getApiUrl, getSolutionVersion } from '../scripts/helpers.js';

export default defineConfig(({ root }) => ({
  define: {
    MY_API_URL: JSON.stringify(getApiUrl()),
    MY_VERSION: JSON.stringify(getSolutionVersion()),
  },
  resolve: {
    alias: { '@src': path.join(root, 'src') },
  },
}));
```

- **Format:** a Vite config: an object (`UserConfig`) or `defineConfig((context, env) => UserConfig)`, sync or async. `context` has `root`, `port`, `origin`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion` and `viteVersion`; `env` is Vite's `ConfigEnv`. Types (`defineConfig`, `FastServeConfig`, `FastServeContext`, and Vite's `UserConfig`, `Plugin`, `ConfigEnv`) come from `spfx-fast-serve-helpers`, so the project doesn't need a `vite` dependency. `.ts`, `.mjs`, `.js` and `.cjs` work too; use `.mts` in SPFx projects (they are CommonJS packages) and write relative imports with the extension (`'../scripts/helpers.js'`).
- **Merging:** the file is merged into `fast-serve`'s own config. Your arrays and maps are added (`plugins`, `resolve.alias`, `define`, `server.proxy`, `optimizeDeps.include`, …). `fast-serve`'s settings win: `root`, `base`, `appType`, `server.host`/`port`/`strictPort`/`origin`/`https`, `server.hmr.overlay`, `css.modules`, `define.DEBUG`, `define['process.env.NODE_ENV']`, `experimental.bundledDev` and `build` are ignored, with a warning that names the `fast-serve` option to use instead (`"server.port" is ignored (use --port or "port" in fast-serve/config.json)`). A plugin from the file that overrides the port, origin, HTTPS, `appType` or `base` after `fast-serve` gets a warning too: the page can't load then.
- **Restarts:** the file is evaluated at start and on every restart. Editing it or any local file it imports (helpers, JSON they read) restarts the server and reloads the page; adding or deleting the file while `fast-serve` runs restarts `fast-serve`. A broken file at start stops `fast-serve` with an error naming the file; a broken edit keeps the running server and prints the error.
- **Scope:** it is an escape hatch for what `fast-serve` can't know. Its content is your code; `fast-serve` loads it, merges it, keeps its own settings and restarts on change. It is Vite configuration, tied to the Vite major this package ships (Vite 8; `context.viteVersion`). Don't depend on `fast-serve`'s internal plugin names or virtual modules. Don't add a React plugin (`fast-serve` runs `@vitejs/plugin-react`), and keep `config/config.json` as the place for externals.

Mapping table (webpack → Vite), the worked example and pitfalls: [research/vite-config.md](research/vite-config.md).

**Startup hint.** When the project has `config/spfx-customize-webpack.js` or `config/webpack-patch.json` and no `fast-serve/vite.extend.*`, `fast-serve` prints a hint at start with the files it found, a minimal example and where to read more. If nothing needs mirroring, add `fast-serve/vite.extend.mts` with `export default {};` to silence it.

**Coding agents.** The package ships an agent skill that writes this file from a webpack customization: `node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md`. Agents don't look into `node_modules` by themselves; reference it from the project's `AGENTS.md` (or `CLAUDE.md`):

```md
- fast-serve (Vite dev server): when the heft webpack customization (config/spfx-customize-webpack.js, config/webpack-patch.json) changes, or for anything in fast-serve/vite.extend.mts, follow node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md.
```

Or copy the skill folder into the project's skills folder (`.agents/skills/`, `.claude/skills/`); a copy doesn't follow package updates.

## HMR: do's and don'ts

- Updates in place, keeping React state: function components in `.tsx` files that export only components; `.module.scss` / `.scss` / `.css`; new imports.
- Reloads the page: edits to the web part, extension or Adaptive Card Extension class and to what only it imports (for ACEs that includes card views, quick views and their JSON templates); files that export components **and** other values; `config/*.json`, `package.json`, `tsconfig.json`, manifests.
- Do setup (icons, PnPjs, listeners) in `onInit`, not at module level: module-level code runs again on every hot update.

Details and examples: [research/hmr.md](research/hmr.md).

## Debugging in VS Code

Source maps point to your `src/*.ts(x)` files on `https://localhost:4321/...`. A `launch.json` for Edge/Chrome that opens the SharePoint page with the debug query: [research/debugging.md](research/debugging.md).

## Errors

Errors show in Vite's error overlay over the SharePoint page and in the terminal:

- compile errors (syntax or transform errors in a file you edit), and in the web part's error box when the bundle fails to load;
- runtime errors from your code: uncaught errors (a `ReferenceError` in a component's render, an error thrown in an event handler) and unhandled promise rejections. The overlay and the terminal show the message, the location in your source (`src/...tsx:line:col`, through source maps), a code frame and the stack trimmed to your code.

Press Esc or click outside to dismiss the overlay; a hot update clears it, and a newer error replaces it. If the overlay is still open at the first edit after the page loaded (an error during the page load), the page reloads instead of hot-updating, as Vite does. A render error that React reports several times (React 18 replays a failed render in development) shows once. The overlay's hint points at the `overlay` option: `"overlay": false` in `fast-serve/config.json` or `--no-overlay` turns it off for compile and runtime errors.

Only errors from your code are shown: their stack trace has a project module (`https://localhost:<port>/src/...`, not `node_modules`) or the `fast-serve` loader. SharePoint's own errors and third-party noise (for example `@pnp/telemetry-js` "Failed to fetch") stay in the browser console, and so do rejections without a stack (`Promise.reject('text')`). `console.error` calls from your code go to the terminal with a code frame but don't open the overlay: the code that logs an error has handled it (React's "The above error occurred in the <X> component" is one of these).

The browser reports the position it has for a stack frame, which isn't always the exact expression: for an undefined name inside JSX children (`{escape(name)}! {printText()}`) Chrome can point at an earlier expression on the same line.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `No valid SPFx development certificate found` | run `npx heft trust-dev-cert` in the project |
| "Error loading debug manifests" on the page | `fast-serve` isn't running, or the browser doesn't trust the certificate (`npx heft trust-dev-cert`, then restart the browser). Chrome/Edge may also ask to allow access to local network devices: allow it |
| "Error loading debug manifests" after you stopped `fast-serve` | the debug query sticks to the browser tab (`sessionStorage`). Open the page in a new tab, without the query |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` is running. Stop it, or use `--port` / `"port"` |
| `Unsupported SPFx version` | install the `spfx-fast-serve-helpers` version matching your SPFx version (see Requirements) |
| `No web parts, extensions or Adaptive Card Extensions found` | check `config/config.json` bundles (library components aren't served yet) |
| `… is the deprecated SharePoint Online workbench (retirement: December 1, 2026)` | set `initialPage` in `config/serve.json` (or `pageUrl`) to a page of your site |
| `serve configuration "x" not found … using "default"` | the `--config` name isn't in `config/serve.json` `serveConfigurations`; the warning lists the names |
| web part shows `[fast-serve] Failed to load bundle …: <error> in src/…:line:col` | a syntax or transform error: details are in the `fast-serve` terminal. Fix the file and the page reloads |
| `ReferenceError` for a constant from webpack's `DefinePlugin`, or `Failed to resolve import` for a webpack alias | mirror the webpack customization in `fast-serve/vite.extend.mts` (see [Customizing the Vite config](#customizing-the-vite-config)) |
| `Module name "x" has not been loaded yet for context: _` | a `require()` reached SharePoint's RequireJS: a computed `require(name)` is left as is (use `import()`; see [require() and AMD in dependencies](#require-and-amd-in-dependencies)) |
| `Mismatched anonymous define() module`, or an import of a UMD library gives `{}` | a script registered with SharePoint's RequireJS; the stack points at an unrelated module. Check `amdPackages` in `fast-serve/config.json` (see [require() and AMD in dependencies](#require-and-amd-in-dependencies)) |
| `… older than … used by the project` | your project uses a newer SPFx version than your tenant serves. It would fail in production too: use the SPFx version your tenant supports |

## Limitations (v1)

- Web parts, extensions and Adaptive Card Extensions only: no library components yet.
- Extensions: a localized command title in a manifest (`"title": { "id": "$…" }`) isn't resolved (heft fills it from the loc file); use `"default"` texts. Relative icon paths (`"iconImageUrl": "./icons/x.png"`) are served from `src`; `"icons/x.png"` without `./` is passed through, as heft does, and resolves against the dev server root.
- Dev server only: no production build, no type checking and no linting (run `tsc --noEmit` / ESLint / `heft build` separately).
- `export * from '<external>'` re-exports nothing from a `config/config.json` external (see [config.json externals](#configjson-externals)).
- `localizedResources` loc files can be JavaScript or TypeScript. Write them as `define([], function () { return { ... }; });`: `export default` / `export =` work in `fast-serve`, but heft copies the compiled file as is and SharePoint can't load an ES module there (`fast-serve` warns).
- A `const enum` declared only in a `.d.ts` file or in a dependency (for example `IconNames` from `@fluentui/font-icons-mdl2`) doesn't work: each file is compiled on its own, so the enum can't be inlined and there is no JavaScript object to import. Use a regular `enum`, or string values. An exported `const enum` in your own `.ts` files works. `fast-serve` explains these cases instead of the browser's cryptic error:
  - a global `declare const enum` from a `.d.ts` in `src` used in a file: a message naming the enum and its `.d.ts`, in the terminal and the browser console (found while compiling the file);
  - an import of a module that only exists as a `.d.ts` (`export declare const enum` in `x.d.ts`): the compile error names the `.d.ts` and its const enums instead of `Failed to resolve import`;
  - a named import that a module doesn't export at runtime (a `const enum` or type from a dependency): the web part, the browser console and the terminal show the browser's "does not provide an export named" error with the fix. The browser finds this one when it links the modules, so it is reported when the page loads.
- `localhost` only (no tunnels, containers or WSL-specific setup); no Teams hosts.
- The page is loaded from `localhost` module by module, so a cold page load of a very large project is slower than `heft start`; edits are much faster.

## Development

```sh
pnpm install
pnpm build      # compile to lib/ with TypeScript 7 (Node code + lib/runtime browser code)
pnpm dev        # watch build (Node code)
pnpm lint       # oxlint with type-aware rules (oxlint-tsgolint), config in .oxlintrc.json
pnpm typecheck
pnpm test
```

Architecture and source layout: [research/HANDOFF.md §8](research/HANDOFF.md) and the [KB](kb/index.md).

## License

MIT
