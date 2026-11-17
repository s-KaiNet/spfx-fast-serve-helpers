# spfx-fast-serve-helpers

> **Work in progress.** Vite-based rewrite for SharePoint Framework **1.24.x** (Heft) projects.

A dev-server-only replacement for `heft start`: the server starts fast, HMR with React Fast Refresh works, and your web parts, extensions and Adaptive Card Extensions run inside a real SharePoint page. Production builds and packaging stay on Heft (`heft build` / `heft package-solution`).

Design notes, decisions and status: [docs/vite/HANDOFF.md](docs/vite/HANDOFF.md).

## Requirements

- An SPFx **1.24.x** project (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`). The package version follows the SPFx version, as in the classic spfx-fast-serve: `spfx-fast-serve-helpers@~1.24.0` serves SPFx 1.24.x. For SPFx up to 1.21 (gulp/webpack), use [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve) with the matching `spfx-fast-serve-helpers@~1.21.0` (or earlier). SPFx 1.22 and 1.23 are not supported. `fast-serve` checks the installed SPFx version at start and exits with a message if it doesn't match.
- Node.js versions supported by SPFx 1.24: 22 (from 22.14), 24 or 26.
- The SPFx development certificate, trusted once per machine (the same one `heft start` uses).

## Migrating

From `heft start` (SPFx 1.22+) or from the classic spfx-fast-serve (SPFx 1.21 and earlier): [docs/migration.md](docs/migration.md), including what's different in development.

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

Open that URL and click **Load debug scripts**. If no page is configured, append the printed query to any SharePoint page URL: `?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true`. The web part must already be on the page (add it from the toolbox while `fast-serve` runs, then save the page).

Web parts, extensions (Application Customizers, ListView Command Sets, Field Customizers, Form Customizers) and Adaptive Card Extensions are served; library components are not yet. Stop the server with Ctrl+C.

### Adaptive Card Extensions

ACEs load with the same debug query as web parts, so nothing needs configuring: open a test page with the printed query, edit it and add the card from the toolbox (it's listed under its manifest title). Microsoft's [ACE tutorial](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension) uses a SharePoint page now, because the SharePoint Online workbench (`/_layouts/15/workbench.aspx`, still the generator's `initialPage`) is retired on December 1, 2026. Until then the workbench works too, and it doesn't need saving: it keeps the unsaved canvas across reloads, which makes it convenient for trying a card without touching a real page. Card interaction (buttons, quick views) is disabled in edit mode: switch to **Preview** on the workbench, or save the page and leave edit mode.

`@microsoft/sp-adaptive-card-extension-base` comes from the page like every SPFx library. Quick view templates (`import template from './template/QuickViewTemplate.json'`, or `require(...)`) and images (`import logo from '../assets/logo.png'`) are served by Vite. Card views and quick views are classes the ACE registers in `onInit`, so editing them, their JSON templates or the ACE class reloads the page ([details](docs/hmr.md#adaptive-card-extensions)).

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
- Without `pageUrl` the configuration uses the page of `default`, then `initialPage`. `{tenantDomain}` works as everywhere.
- A `pageUrl` option (`--page-url` or `config/fast-serve.json`) replaces the page of every configuration (`fast-serve` says so when it starts). Leave it unset when you switch between list configurations.
- At start `fast-serve` warns about configurations that don't fit the project: an id that isn't one of your extensions, a field customizer used as a command set, the generator's placeholders (`InternalFieldName`, `/sites/mySite/Lists/MyList`).
- The configuration is read at start: restart `fast-serve` after editing `serve.json` to get the new URL.

### Options

Zero config works. Options, by precedence:

1. command-line flags: `fast-serve --port 4400 --page-url https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx --locale de-de --config rating`
2. `config/fast-serve.json` (optional, JSON with comments):
   ```json
   { "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us", "serveConfiguration": "default" }
   ```
3. SPFx defaults: `config/serve.json` `port`, the page of the serve configuration (`serveConfigurations.<name>.pageUrl`, then `serveConfigurations.default.pageUrl`) or `initialPage`, then port `4321` and locale `en-us`.

| Option | Flag | Meaning |
|---|---|---|
| `port` | `-p, --port` | HTTPS port on `localhost` |
| `pageUrl` | `--page-url` | page printed with the debug query. `{tenantDomain}` is replaced with the `SPFX_SERVE_TENANT_DOMAIN` environment variable (e.g. `contoso.sharepoint.com`) |
| `locale` | `--locale` | locale of `localizedResources` strings (falls back to `en-us` per resource) |
| `serveConfiguration` | `--config`, `--serve-config` | `config/serve.json` `serveConfigurations` entry to use (default: `default`); an unknown name stops with the list of names |

HTTPS is always on, with the SPFx development certificate. There is no `vite.config` to write: `fast-serve` configures Vite itself.

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
- **Theme colors.** `"[theme:themePrimary, default: #0078d4]"` tokens in your styles resolve to the page theme when a stylesheet is inserted or hot-updated. Switching the site theme while the page is open does not recolor them: reload the page.

## HMR: do's and don'ts

- Updates in place, keeping React state: function components in `.tsx` files that export only components; `.module.scss` / `.scss` / `.css`; new imports.
- Reloads the page: edits to the web part, extension or Adaptive Card Extension class and to what only it imports (for ACEs that includes card views, quick views and their JSON templates); files that export components **and** other values; `config/*.json`, `package.json`, `tsconfig.json`, manifests.
- Do setup (icons, PnPjs, listeners) in `onInit`, not at module level: module-level code runs again on every hot update.

Details and examples: [docs/hmr.md](docs/hmr.md).

## Debugging in VS Code

Source maps point to your `src/*.ts(x)` files on `https://localhost:4321/...`. A `launch.json` for Edge/Chrome that opens the SharePoint page with the debug query: [docs/debugging.md](docs/debugging.md).

## Troubleshooting

| Symptom | What to do |
|---|---|
| `No valid SPFx development certificate found` | run `npx heft trust-dev-cert` in the project |
| "Error loading debug manifests" on the page | `fast-serve` isn't running, or the browser doesn't trust the certificate (`npx heft trust-dev-cert`, then restart the browser). Chrome/Edge may also ask to allow access to local network devices: allow it |
| "Error loading debug manifests" after you stopped `fast-serve` | the debug query sticks to the browser tab (`sessionStorage`). Open the page in a new tab, without the query |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` is running. Stop it, or use `--port` / `"port"` |
| `Unsupported SPFx version` | install the `spfx-fast-serve-helpers` version matching your SPFx version (see Requirements) |
| `No web parts, extensions or Adaptive Card Extensions found` | check `config/config.json` bundles (library components aren't served yet) |
| `Serve configuration "x" not found` | the `--config` name isn't in `config/serve.json` `serveConfigurations`; the message lists the names |
| web part shows `[fast-serve] Failed to load bundle …: <error> in src/…:line:col` | a syntax or transform error: details are in the `fast-serve` terminal. Fix the file and the page reloads |
| `… older than … used by the project` | your project uses a newer SPFx version than your tenant serves. It would fail in production too: use the SPFx version your tenant supports |

## Limitations (v1)

- Web parts, extensions and Adaptive Card Extensions only: no library components yet.
- Extensions: a localized command title in a manifest (`"title": { "id": "$…" }`) isn't resolved (heft fills it from the loc file); use `"default"` texts. Relative icon paths (`"iconImageUrl": "./icons/x.png"`) are served from `src`; `"icons/x.png"` without `./` is passed through, as heft does, and resolves against the dev server root.
- Dev server only: no production build, no type checking and no linting (run `tsc --noEmit` / ESLint / `heft build` separately).
- No error overlay; errors show in the web part, the browser console and the terminal. The terminal only gets browser errors that come from your code: uncaught errors, unhandled rejections and `console.error` calls whose stack trace includes a project module (`https://localhost:<port>/src/...`, not `node_modules`) or the `fast-serve` loader. SharePoint's own errors and third-party noise (for example `@pnp/telemetry-js` "Failed to fetch") stay in the browser console, and so do rejections without a stack (`Promise.reject('text')`).
- `config/config.json` `externals` (URLs and local files, with `globalName`/`globalDependencies`) are loaded by SharePoint's RequireJS like in heft, never bundled from `node_modules`. Named imports from an external (`import { ajax } from 'jquery'`) only work when a package with the same name is installed (its export names are used); otherwise use the default import.
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

Source layout: [src/README.md](src/README.md).

## License

MIT
