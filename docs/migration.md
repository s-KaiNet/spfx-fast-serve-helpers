# Migrating to fast-serve for SPFx 1.24 (Vite)

`fast-serve` replaces `heft start` while you develop. `heft build`, `heft test` and `heft package-solution` don't change, and nothing it does ends up in your `.sppkg`.

- [From `heft start` (SPFx 1.22+)](#from-heft-start-spfx-122)
- [From spfx-fast-serve (SPFx 1.21 and earlier)](#from-spfx-fast-serve-spfx-121-and-earlier)
- [What's different in development](#whats-different-in-development)

## From `heft start` (SPFx 1.22+)

`fast-serve` supports SPFx **1.24.x**. Upgrade a 1.22/1.23 project to 1.24 first.

1. Install the package matching your SPFx version:
   ```sh
   npm install --save-dev spfx-fast-serve-helpers@~1.24.0
   ```
2. Trust the SPFx development certificate (skip this if `heft start` already worked on this machine, it's the same certificate):
   ```sh
   npx heft trust-dev-cert
   ```
3. Add a script next to the existing `start`:
   ```jsonc
   "scripts": {
     "start": "heft start --clean",
     "serve": "fast-serve"
   }
   ```
4. Optionally set the page to open in `config/fast-serve.json`. Without it, `fast-serve` uses `config/serve.json` (`port`, the `serveConfigurations` page and extension parameters, `initialPage`), like `heft start`. `heft start --serve-config <name>` becomes `fast-serve --config <name>`. A serve configuration's own `pageUrl` wins over this `pageUrl` (the option replaces `serveConfigurations.default.pageUrl` and `initialPage`), so `--config <list configuration>` still opens its list:
   ```json
   { "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx" }
   ```
5. Run `npm run serve`, open the printed URL and click **Load debug scripts**.

`heft start` and `fast-serve` use the same port by default (4321), so run only one of them at a time.

## From spfx-fast-serve (SPFx 1.21 and earlier)

The classic spfx-fast-serve wrapped SPFx's gulp/webpack build. SPFx 1.22 replaced gulp with Heft, so there's no in-place upgrade: upgrade the project first, then set up the new `fast-serve`.

1. Upgrade the project to SPFx 1.24 (for example with the CLI for Microsoft 365: `m365 spfx project upgrade`). Check that `heft build` works before you continue.
2. Remove the old setup:
   - the `fast-serve/` folder (`config.json`, `webpack.extend.js`);
   - `spfx-fast-serve-helpers` 1.21 (or earlier) from `devDependencies`.
3. Follow [From `heft start`](#from-heft-start-spfx-122). The script name stays the same: `"serve": "fast-serve"`.

Old settings (`fast-serve/config.json` `serve` section or CLI flags) and what replaces them:

| Old setting | Now |
|---|---|
| `port` | `port` (`-p, --port`) |
| `openUrl` | `pageUrl` (`--page-url`). The URL is printed with the debug query, not opened |
| `locale` | `locale` (`--locale`) |
| `hotRefresh` | always on: HMR with React Fast Refresh |
| `config` (serve configuration) | `--config <name>` (or `"serveConfiguration"` in `config/fast-serve.json`): the `config/serve.json` `serveConfigurations` entry, as in heft (`--serve-config`) |
| `isLibraryComponent` | not supported yet |
| `fullScreenErrors` | not configurable: compile errors show in Vite's error overlay, the web part and the terminal |
| `eslint` | not included: run ESLint separately |
| `loggingLevel`, `debug`, `memory`, `reactProfiling` | removed |
| `containers` | not supported yet (Docker/WSL) |
| `webpack.extend.js` | no equivalent: there's no webpack, and `fast-serve` configures Vite itself (zero config) |

## What's different in development

| | `heft start` / classic spfx-fast-serve | `fast-serve` (Vite) |
|---|---|---|
| Build | webpack bundles per `config.json` bundle | no bundles: each source file is transformed on request and loaded by the browser as a native ES module |
| Server start | seconds (full build first) | about a second or less (nothing is built up front) |
| Edit | rebuild, then page reload | hot update in place, React state kept ([HMR do's and don'ts](hmr.md)) |
| Module instances | one copy per bundle | one ES module graph for the whole page: all bundles share one instance of each module |
| React | the production React that SharePoint ships | the development build from your project's `node_modules` (needed for Fast Refresh; React DevTools and warnings work) |
| `@microsoft/sp-*` | webpack externals | loaded from the page on demand: the same instances (and the same tenant version) as in production |
| Type checking, ESLint | part of the build | not included: run `tsc --noEmit`, ESLint or `heft build` |
| Output | `lib/`, `dist/`, `temp/` | only typings in `temp/sass-ts` and `temp/static-asset-ts`, so the IDE knows new classes and assets |

Things to know:

- **One module graph.** In production every bundle has its own copy of shared modules. In dev they share one, so module-level state is shared between bundles. Don't rely on it either way.
- **Debug URL stickiness.** SharePoint remembers the debug query for the browser tab (`sessionStorage`). After you stop `fast-serve`, opening the page without the query in the same tab still tries `localhost` and shows "Error loading debug manifests". Use a new tab.
- **Certificate.** The browser must trust the SPFx development certificate (`npx heft trust-dev-cert`, then restart the browser).
- **Local Network Access prompt.** Chrome and Edge may ask whether the SharePoint page may access devices on your local network (`https://localhost`). Allow it, or the debug manifests don't load.
- **CommonJS in your source.** Relative `require('./logo.png')` / `require('./data.json')` and `require('@alias/logo.png')` through a `tsconfig` `paths` alias are turned into imports. Other `require()` calls in `src` aren't: use `import`.
- **Type re-exports.** `export { IProps } from './IProps'` without `type` works in webpack but not in native ES modules: `fast-serve` removes it and tells you where. Use `export type { IProps }`.
- **Decorators and `const enum`.** Legacy decorators and class field semantics follow your `tsconfig.json` like in heft. With `emitDecoratorMetadata`, import interfaces and types from other files with `import type` (`fast-serve` drops a kept type import from the served code and warns). A `const enum` that exists only in a `.d.ts` file or a dependency can't be used: switch to a regular `enum` (`fast-serve` names the enum, the `.d.ts` or the missing export). Details in the [README](../README.md#typescript-settings-static-assets-and-theme-colors).
- **Production stays on Heft.** Always check the result with `heft build` / `heft package-solution` before you ship.
