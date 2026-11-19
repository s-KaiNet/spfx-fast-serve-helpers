---
title: Customizing the Vite config (fast-serve/vite.extend.mts)
type: feature
status: current
tags:
  - project-kb
  - vite
  - configuration
  - webpack-customization
  - agent-skill
---

# Customizing the Vite config (fast-serve/vite.extend.mts)

## Summary

`fast-serve` never runs webpack, so a heft webpack customization (`config/spfx-customize-webpack.js`, or `config/webpack-patch.json` with its patch files) doesn't apply to it. Projects that need those customizations in development mirror them in the optional `fast-serve/vite.extend.mts`, the counterpart of the classic `fast-serve/webpack.extend.js`: a plain Vite config merged under `fast-serve`'s own settings, reloaded on change. Without the file nothing changes. A startup hint and an agent skill shipped in the package help write it.

## Behavior

### File and format

- Location: the project's `fast-serve/` folder, next to `fast-serve/config.json`. Looked up as `vite.extend.mts`, then `.ts`, `.mjs`, `.js`, `.cjs`; the first found is used. `.mts` is recommended: SPFx projects are CommonJS packages, and Vite warns about ESM syntax in a `.ts` file there. Relative imports are written with their extension (`'../scripts/helpers.js'`); named imports from CommonJS helpers work.
- Content: a Vite config object (`UserConfig`), a promise of one, or `defineConfig((context, env) => UserConfig)` (sync or async). `env` is Vite's `ConfigEnv`.
- `context` fields: `root`, `port`, `origin`, `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `viteVersion`. They come from the resolved options and the installed SPFx version.
- Types and `defineConfig` are exported by `spfx-fast-serve-helpers` (`defineConfig`, `FastServeConfig`, `FastServeContext`, plus Vite's `UserConfig`, `Plugin`, `ConfigEnv`), so the project needs no `vite` dependency. Calling a `defineConfig` function outside `fast-serve` throws a clear error.
- At start `fast-serve` prints `Vite config: fast-serve/vite.extend.mts` when the file is used.

### Merging and protected settings

- The user's arrays and maps are added to `fast-serve`'s (`plugins`, `resolve.alias`, `define`, `server.proxy`, `optimizeDeps.include`, `css.preprocessorOptions`, …). User plugins run before `fast-serve`'s plugins of the same order, so a user alias wins over tsconfig `paths`.
- `fast-serve`'s settings win. These keys are ignored with a warning that names the alternative: `root`, `base`, `appType`, `server.host`/`port`/`strictPort`/`origin`/`https`, `server.hmr.overlay`, `css.modules`, `define.DEBUG`, `define['process.env.NODE_ENV']`, `experimental.bundledDev`, `build`. Port and overlay warnings point to `--port` / `"port"` and `--no-overlay` / `"overlay"` in `fast-serve/config.json`.
- A plugin from the file that changes the port, origin, HTTPS, `appType` or `base` after `fast-serve` (for example with `enforce: 'post'`) gets a warning that names the expected value; the SharePoint page can't load the components then. Guard rails only warn, they never stop the server.

### Reloading

- The file is evaluated at start and on every server restart, so computed values (build time, version from `package-solution.json`) equal the server start time, like `heft start` building its webpack config once.
- Editing the file or any local file it imports (helpers, JSON they read) restarts the Vite server and reloads the open page; changed plugins, defines or aliases re-run dependency pre-bundling once.
- Adding or deleting the file while `fast-serve` runs fully restarts `fast-serve` (new options, project model and server).
- A broken file at start stops `fast-serve` with an error naming the file. A broken edit of a loaded file keeps the running server and prints the error. A broken newly added file is reported and the server keeps running without it; `fast-serve` restarts once the file loads.

### Startup hint for webpack customizations

- When the project has `config/spfx-customize-webpack.js` or `config/webpack-patch.json` (plus its existing patch files) and no `fast-serve/vite.extend.*`, `fast-serve` prints a hint at start: the files found, a minimal `defineConfig` example, the docs link, the location of the shipped agent skill and a line to add to the project's `AGENTS.md`.
- Detection is static (file existence and the `patchFiles` list); no webpack code runs and there is no drift check against an existing extend file. A project that needs nothing in development silences the hint with `export default {};` in the extend file.

### What to mirror (summary of the shipped skill)

- Mirror what changes program semantics in dev: `DefinePlugin` / `EnvironmentPlugin` → `define` with the same `JSON.stringify` values (computed from the same helpers); webpack aliases → `resolve.alias` pointing at `src`, never `lib`; loaders for extra file types (SVG as component, Less, raw text, YAML) → Vite plugins; `devServer.proxy` / `headers` → `server.*`; `ProvidePlugin` → explicit imports.
- Already handled by `fast-serve`: syntax loaders (Babel for lit, `?.`, `??`), library CSS as global (only `*.module.css` / `*.module.scss` are CSS modules), tsconfig `paths`, `config/config.json` externals.
- Not needed in dev: `output`, `optimization`, `devtool`, `performance`, `stats`, `cache`, analyzers, Terser, Copy, type-check plugins.
- Don't add a React plugin (`fast-serve` runs `@vitejs/plugin-react`), don't add Vite externals (externals stay in `config/config.json`), and don't depend on `fast-serve`'s internal plugin names or virtual modules. Source in `src` must stay valid for webpack (no `?raw` / `?url` unless webpack supports them too).

### Agent skill

- The npm package ships the `fast-serve-vite-config` skill (workflow, template, webpack → Vite mapping table, don'ts, pitfalls) at `node_modules/spfx-fast-serve-helpers/skills/fast-serve-vite-config/SKILL.md`.
- Coding agents don't look into `node_modules` by themselves: projects reference the skill from their `AGENTS.md` (or `CLAUDE.md`), or copy the folder into their skills folder (a copy doesn't follow package updates). There is no install command.

## Implementation Notes

- The file is passed to Vite as its config file with Vite's bundle loader pinned, so Vite bundles TypeScript/ESM/CJS, follows local imports, watches the file and its dependencies and restarts on change. `fast-serve`'s plugins contribute their settings through their own config hooks, which merge over the user file.
- The context is published before the server is created, and `defineConfig` reads it when Vite calls the config function.
- A guard plugin checks the raw user config before `fast-serve`'s hooks (ignored keys) and the final resolved config (plugin overrides).
- A watcher handles add and delete of extend-file candidates; a session layer above the dev server performs the full restart and swaps the server the CLI closes on Ctrl+C. A newly added file is test-loaded before restarting.
- Webpack customization detection lives in the Vite-free project model; the hint is printed only when no extend file exists.

## Edge Cases

- `define` values are expressions evaluated on their own in the browser: Vite assigns user defines to `globalThis` before component code runs instead of inlining them, so values must not reference variables, `require` or imports, and keys must be identifiers or member paths.
- A user alias and a tsconfig `paths` entry for the same prefix should point at the same `src` file.
- The file is tied to the Vite major shipped by the package (Vite 8 today); `context.viteVersion` allows branching.
- `.env*` files in the project root already restart Vite with or without an extend file.

## Links

- [Zero-config CLI with an optional Vite extend file](../decisions/zero-config-cli.md)
- [CLI, options and startup](cli-and-options.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [Vite 8, Oxc and Rolldown facts relied upon](../references/vite-oxc-rolldown.md)
- [SPFx library imports and config.json externals](library-imports-and-externals.md)

## Evidence

- Source: user docs, Vite config guide, shipped agent skill, Vite extensibility research (prototype verified live on a tenant), user decisions in the project handoff notes, implementation behavior (extend-file loading, guard, watcher, webpack customization hint)
- Confidence: high
- Last checked: 2026-11-19
