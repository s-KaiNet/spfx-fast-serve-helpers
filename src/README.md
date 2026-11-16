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
| `externals/` | `@microsoft/sp-*` (SPFx library) facades. The strategy (currently: manifest lists + shim preloads) is hidden behind `SpfxExternals` |
| `localization/` | `*Strings` virtual modules from `loc/<locale>.js` |
| `styles/` | SPFx CSS modules naming, `~` Sass imports, theme tokens via the `themedStyles` runtime |
| `transforms/` | source-level compatibility: `DEBUG` / `process.env.NODE_ENV` defines |
| `server/` | HTTPS (Rushstack dev certificate), port/origin, watch ignores, warmup, React dedupe, debug URL, project-model changes → full reload |
| `runtime/` | browser code as TS (own `tsconfig.json`: DOM, no Node), built to `lib/runtime`: `componentShim.ts` (classic script), `themedStyles.ts` (ES module). `contracts.ts` holds the types shared with Node |
| `utils/` | small helpers (JSONC, paths, runtime source loading, Vite helpers) |

Conventions:

- A feature = one module that returns Vite plugin(s) (each contributes its own Vite config via `config()`), plus its
  browser runtime and tests.
- Tests live next to the code as `*.test.ts` (vitest); fixtures in `test/fixtures/`. Tests are excluded from the build.
- Node code is ESM (`NodeNext`): use `.js` extensions in relative imports.
- Runtime files are served from `lib/runtime/*.js`; when running from sources (tests) the `.ts` file is transpiled on
  the fly (`utils/runtimeSource.ts`).
