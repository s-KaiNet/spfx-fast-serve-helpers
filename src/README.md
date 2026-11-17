# Source layout

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**
(see [docs/vite/HANDOFF.md §8](../docs/vite/HANDOFF.md)).

Entry points:

- `cli.ts`: `fast-serve` bin (thin; process wiring only).
- `runCli.ts`: argument parsing (testable, no `process` access).
- `devServer.ts`: `startDevServer()`: SPFx version check → options + project model → `vite.createServer()` (no user `vite.config`). Startup failures (port in use, certificate, no web parts) close the server and are rethrown as readable messages; the CLI exits with code 1.
- `plugins.ts`: composes the feature modules' Vite plugins.
- `context.ts`: `ServeContext` (root, resolved options, project model, logger) passed to every module.

Modules:

| Folder | Owns |
|---|---|
| `config/` | options (`port`, `pageUrl`, `locale`): CLI flags > `config/fast-serve.json` > `config/serve.json` > defaults |
| `project/` | SPFx project facts, plain Node, **no Vite imports**: config.json bundles → components, manifests, package.json, serve.json, loc files, SPFx libraries in node_modules, `config.json` `externals` (`configExternals.ts`: URLs and local files with `globalName`/`globalDependencies`, validated like heft; SPFx libraries win over an external with the same name), lib→src mapping, `tsconfig.json` `paths`/`baseUrl` through `extends` (`tsconfigPaths.ts`, tsc's matching rules). Cached; `invalidate(file)` returns `'model'` or `'tsconfig'`. `spfxVersion.ts`: installed SPFx version (`@microsoft/sp-core-library`, then `spfx-heft-plugins`) checked against this package's `major.minor` |
| `manifests/` | `GET /temp/build/manifests.js` (debug manifests) |
| `loader/` | AMD shim per bundle (`/@spfx/bundle/<bundle>.js`) + generated ESM entry (`/@spfx/entry/<bundle>`) with the Fast Refresh preamble; `optimizeDeps.entries`. `serverErrors.ts`: records the last server error (error-handling middleware) and serves `/@spfx/status` (`{ error, fileRevision }`); the shim uses it to show compile errors in the web part and to reload the page after the next file change when a bundle failed to load |
| `externals/` | SPFx library facades (`@microsoft/sp-*` and any package shipping an SPFx library manifest, discovered like SPFx's own externals scan). ESM importers get a top-level-await facade (`loadComponentById(id, version)` via the `libraryLoader` runtime); `require()` importers in pre-bundled deps get a sync facade plus one `await preloadLibraries([...])` per chunk. `config.json` `externals` get the same treatment through `loadExternal(name)` (the component-scoped RequireJS `require`, so the manifest's `paths`/`shim` apply) with ESM/CJS facades and the chunk preload; local files are served from `/@spfx/external/<name>.js`. The debug manifest lists `@microsoft/sp-loader` plus the externals (`type: "path"`, URLs passed through, local files as absolute dev server URLs, `globalName`, `globalDependencies`) |
| `aliases/` | tsconfig `paths`/`baseUrl` for project scripts (`enforce: 'pre'` resolver trying the project model's candidates in order). Vite 8's own `resolve.tsconfigPaths` is not used: it ignores the aliases when the `include` comes from an extended config, which is exactly the SPFx rig setup |
| `assets/` | static-asset typings (`temp/static-asset-ts/**/*.d.ts`, byte-identical to Heft's `static-asset-typings` task) from the project's rig-aware `config/static-asset-typings.json`, written at start and on add, removed on unlink |
| `localization/` | `*Strings` virtual modules from `loc/<locale>.js` or `.ts`: AMD JavaScript is evaluated directly; TypeScript (and JavaScript ES modules) is bundled to CommonJS with Rolldown first, so `export default`, `export =`, typed `define(...)` and imports work. Non-AMD loc files get a warning, because heft copies them to `dist/` as is where RequireJS can't load them |
| `styles/` | SPFx CSS modules naming, `~` Sass imports, theme tokens via the `themedStyles` runtime (resolved once per style insert/hot update, no theme-change watching); `scssTypings/`: Sass typings (`temp/sass-ts/**/*.d.ts`) regenerated on add/change/unlink and once after the server starts, with heft's own `SassProcessor` and the project's `config/sass.json` (rig-aware, both resolved from the project) so the output is byte-identical to `heft build` |
| `transforms/` | source-level compatibility for project source: `DEBUG` / `process.env.NODE_ENV` defines; relative `require('./x.png' / './t.json' / ...)` → hoisted ESM imports (assets as `?url`, JSON as default, scripts/styles as namespaces); type re-exports without `type` (`export { IFoo } from`, or an imported type exported again) are checked against the target's runtime exports (Vite's cached transform + es-module-lexer, following `export *`), removed from the served code and reported in the terminal and the browser console |
| `server/` | HTTPS (Rushstack dev certificate), port/origin, watch ignores, warmup, React dedupe, debug URL, project-model changes → full reload (tsconfig changes also invalidate every transformed module, so imports re-resolve); Vite logger that drops the reason-less `[Unhandled rejection] Unknown Error: undefined` SharePoint raises on every page load (forwarded by `server.forwardConsole`) |
| `runtime/` | browser code as TS (own `tsconfig.json`: DOM, no Node), built to `lib/runtime`: `componentShim.ts` and `libraryLoader.ts` (classic scripts, concatenated into the bundle shim), `themedStyles.ts` (ES module). `contracts.ts` holds the types shared with Node |
| `utils/` | small helpers (JSONC, paths, runtime source loading, Vite helpers, `heftProject.ts`: loading Heft packages and rig-aware config files from the project) |

Conventions:

- A feature = one module that returns Vite plugin(s) (each contributes its own Vite config via `config()`), plus its
  browser runtime and tests.
- Tests live next to the code as `*.test.ts` (vitest); fixtures in `test/fixtures/`. Tests are excluded from the build.
- Node code is ESM (`NodeNext`): use `.js` extensions in relative imports.
- Runtime files are served from `lib/runtime/*.js`; when running from sources (tests) the `.ts` file is transpiled on
  the fly (`utils/runtimeSource.ts`).
