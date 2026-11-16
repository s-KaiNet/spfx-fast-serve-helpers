# Source layout

Data flow: **config → project model → generated artifacts → Vite server → browser runtime**
(see [docs/vite/HANDOFF.md §8](../docs/vite/HANDOFF.md)).

Entry points:

- `cli.ts`: `fast-serve` bin (thin; process wiring only).
- `runCli.ts`: argument parsing (testable, no `process` access).
- `devServer.ts`: `startDevServer()`: options + project model → `vite.createServer()` (no user `vite.config`).
- `plugins.ts`: composes the feature modules' Vite plugins.
- `context.ts`: `ServeContext` (root, resolved options, project model, logger) passed to every module.

Modules:

| Folder | Owns |
|---|---|
| `config/` | options (`port`, `pageUrl`, `locale`): CLI flags > `config/fast-serve.json` > `config/serve.json` > defaults |
| `project/` | SPFx project facts, plain Node, **no Vite imports**: config.json bundles → components, manifests, package.json, serve.json, loc files, SPFx libraries in node_modules, lib→src mapping. Cached; `invalidate(file)` |
| `manifests/` | `GET /temp/build/manifests.js` (debug manifests) |
| `loader/` | AMD shim per bundle (`/@spfx/bundle/<bundle>.js`) + generated ESM entry (`/@spfx/entry/<bundle>`) with the Fast Refresh preamble; `optimizeDeps.entries` |
| `externals/` | SPFx library facades (`@microsoft/sp-*` and any package shipping an SPFx library manifest, discovered like SPFx's own externals scan). ESM importers get a top-level-await facade (`loadComponentById(id, version)` via the `libraryLoader` runtime); `require()` importers in pre-bundled deps get a sync facade plus one `await preloadLibraries([...])` per chunk. The debug manifest lists only `@microsoft/sp-loader` |
| `localization/` | `*Strings` virtual modules from `loc/<locale>.js` |
| `styles/` | SPFx CSS modules naming, `~` Sass imports, theme tokens via the `themedStyles` runtime |
| `transforms/` | source-level compatibility for project source: `DEBUG` / `process.env.NODE_ENV` defines; relative `require('./x.png' / './t.json' / ...)` → hoisted ESM imports (assets as `?url`, JSON as default, scripts/styles as namespaces); type re-exports without `type` (`export { IFoo } from`, or an imported type exported again) are checked against the target's runtime exports (Vite's cached transform + es-module-lexer, following `export *`), removed from the served code and reported in the terminal and the browser console |
| `server/` | HTTPS (Rushstack dev certificate), port/origin, watch ignores, warmup, React dedupe, debug URL, project-model changes → full reload |
| `runtime/` | browser code as TS (own `tsconfig.json`: DOM, no Node), built to `lib/runtime`: `componentShim.ts` and `libraryLoader.ts` (classic scripts, concatenated into the bundle shim), `themedStyles.ts` (ES module). `contracts.ts` holds the types shared with Node |
| `utils/` | small helpers (JSONC, paths, runtime source loading, Vite helpers) |

Conventions:

- A feature = one module that returns Vite plugin(s) (each contributes its own Vite config via `config()`), plus its
  browser runtime and tests.
- Tests live next to the code as `*.test.ts` (vitest); fixtures in `test/fixtures/`. Tests are excluded from the build.
- Node code is ESM (`NodeNext`): use `.js` extensions in relative imports.
- Runtime files are served from `lib/runtime/*.js`; when running from sources (tests) the `.ts` file is transpiled on
  the fly (`utils/runtimeSource.ts`).
