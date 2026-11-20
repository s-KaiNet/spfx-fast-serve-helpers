---
title: Rspack extend file (fast-serve/rspack.extend.mjs)
type: feature
status: current
tags:
  - project-kb
  - rspack
  - configuration
  - webpack-customization
  - agent-skill
---

# Rspack extend file (fast-serve/rspack.extend.mjs)

## Summary

`fast-serve` never runs heft's webpack config, so a heft webpack customization (`config/spfx-customize-webpack.js`, or `config/webpack-patch.json` with its patch files) doesn't apply to it. Projects mirror what they need in development in the optional `fast-serve/rspack.extend.mjs`: a Rspack config fragment merged into fast-serve's own config. Because Rspack is webpack-compatible, most customizations translate almost 1:1 (`webpack.DefinePlugin` → `rspack.DefinePlugin`, aliases, rules). A startup hint and an agent skill shipped in the package help write it.

## Behavior

### File and format

- Location: the project's `fast-serve/` folder. Looked up as `rspack.extend.mjs`, `.mts`, `.js`, `.ts`, `.cjs`, `.cts`; the first found is used, others are named in a warning.
- All formats work on every supported Node version (from 22.14): fast-serve bundles the file and its local imports with Rspack (SWC strips TypeScript) into a temporary ES module next to it, imports it and deletes it. Local imports may be ESM or CommonJS, TypeScript or JavaScript, JSON; `__dirname`/`__filename` and `import.meta.url` in them keep their source locations; relative imports are written with their extension (`.js` also finds `.ts`). Bare imports (packages, `node:` built-ins) are loaded by Node from the project, so `spfx-fast-serve-helpers` and its `rspack` are the instances fast-serve uses.
- Content: a Rspack `Configuration`, a promise of one, or a function `(context, env) => Configuration` (sync or async), usually written as `defineConfig(fn)`. A CommonJS file's `module.exports` is its default export.
- `context`: `root`, `port`, `origin`, `publicPath` (`https://localhost:<port>/dist/`), `locale`, `serveConfiguration`, `pageUrl`, `spfxVersion`, `fastServeVersion`, `rspackVersion`; frozen. `env`: `{ command: 'serve', mode: 'development' }`.
- Public package entry: `defineConfig` (returns its argument, typed), `rspack` (re-exported from `@rspack/core`), types `Configuration`, `RspackPluginInstance`, `Plugin`, `RuleSetRule`, `ResolveAlias`, `ExternalItem`, `DevServer`, `Compiler`, `FastServeConfig`, `FastServeConfigFunction`, `FastServeContext`, `FastServeEnv`. The project needs no own `@rspack/core` dependency; an extend file in TypeScript type-checks against the installed package.
- `TunnelServePlugin` (exported with its `TunnelServeOptions` type) is a marker plugin that fast-serve takes out of `plugins` and turns into [tunnel mode](tunnel-mode.md); the context still describes `localhost`, because it is computed before the file runs.
- At start `fast-serve` prints `Rspack config: fast-serve/rspack.extend.mjs` when the file is used.

### Merging

- After fast-serve's config, like `webpack-merge`: plain objects merged deeply, arrays appended (`plugins`, `module.rules`, `resolve.extensions`, …), other values replaced (`devtool`, `watchOptions.ignored`, …). `externals` of any shape are appended to fast-serve's list.
- `devServer` additions are merged into fast-serve's dev-server settings: `proxy` and other plain keys; `headers` (object, array or function) are added on top of fast-serve's CORS/PNA and `no-store` headers; `setupMiddlewares` receives fast-serve's finished middleware list.
- Rules are appended, and in Rspack every matching rule applies: a second rule for a file type fast-serve already handles (TypeScript, CSS/SCSS, images, fonts and `.svg` as URLs) runs on top of fast-serve's. A webpack customization that replaces one of heft's built-in rules (for example SVG as a React component) can't be mirrored 1:1.

### Guard rails (warn only)

These keys are ignored, each with a warning that names the alternative; the server never stops because of them: `entry`, `mode`, `context`, `target`, `amd`, `externalsType`, every `output.*` key (`publicPath` points to `--port`/`"port"` and to `TunnelServePlugin`), `devServer: false`, `devServer.port` (`--port` or `"port"` in `fast-serve/config.json`), `host`, `server`, `https`, `hot`, `liveReload`, `client` (`--no-overlay` / `"overlay"`; the websocket URL follows the origin, `TunnelServePlugin` for a tunnel), `webSocketServer`, `devMiddleware`, `allowedHosts`. `externals` are applied but warned about: the debug manifests don't list them, so SharePoint can only resolve them when the page already loaded them; `config/config.json` externals are the supported way.

### Reloading and errors

- Evaluated at start and on every restart, so computed values are those of the server start (like `heft start` building its webpack config once).
- Editing the file or any local file it imports, or adding/removing an extend file, restarts the server ([restarts](project-restarts.md)); the page reloads by itself.
- A broken file at start (syntax error, missing import, thrown error, default export that is not an object or function) stops `fast-serve`: `<file> could not be loaded:` + the error with the failing file and a code frame + `Fix or remove the file and run fast-serve again.` A broken edit while running prints the same error with `The server keeps running with the previous configuration; fast-serve restarts when the file is fixed.`

### Startup hint for webpack customizations

When the project has `config/spfx-customize-webpack.js` or `config/webpack-patch.json` (plus its existing patch files) and no extend file, the first start prints a hint: the files found, that fast-serve doesn't run them, a minimal `defineConfig` + `rspack.DefinePlugin` example, the docs link, the location of the shipped skill, a line to add to the project's `AGENTS.md`, and `export default {};` to silence it. Detection is static; no webpack code runs.

### Agent skill

The package ships `skills/fast-serve-rspack-config/SKILL.md` (at `node_modules/spfx-fast-serve-helpers/skills/fast-serve-rspack-config/SKILL.md` in a project): workflow, template, webpack → Rspack mapping (DefinePlugin/EnvironmentPlugin/ProvidePlugin and other plugins by the same name on `rspack.`, aliases into `src` not `lib`, no Babel for lit or modern syntax, CSS rules usually unnecessary, new file types as rules, externals in `config/config.json`), `TunnelServePlugin` for the classic tunnel flow, the guarded keys and pitfalls (rule stacking, `JSON.stringify`, values fixed at start). Projects reference it from their `AGENTS.md`.

## Implementation Notes

- The temporary bundle uses Rspack's ES module output (no experiment flag needed in Rspack 2), a virtual entry that re-exports the file's namespace (so a missing default export is a clear message instead of a linking error in strict `.mjs`), `node-commonjs` externals for `require()` and `module` externals for `import`, eager dynamic imports, and a tiny loader that declares `__dirname`/`__filename` per local module without shifting lines. Its file dependencies outside `node_modules` (minus fast-serve's own files) are the watch list.
- Guard and merge run when the dev server is prepared; the merged dev-server settings go to `@rspack/dev-server`.
- Webpack customization detection lives in the bundler-free project model.

## Links

- [Restarts on project changes](project-restarts.md)
- [CLI, options and startup](cli-and-options.md)
- [Rspack compile](rspack-compile.md)
- [Rspack with our own configuration](../decisions/rspack-with-own-config.md)
- [SPFx 1.24 Heft pipeline (reverse-engineered)](../references/spfx-heft-pipeline.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: unit tests (lookup order, guard, merge incl. dev-server headers/middlewares, context, hint, `__dirname` declarations), load tests (`.mjs` object, `.mts` with TypeScript/JSON/CommonJS helpers and a package, `.cjs`, promise export, syntax error with dependencies, missing import, thrown error, wrong export, fresh helper values on reload), a public-API type-check test against emitted declarations without a project `@rspack/core`, the session integration test; live on a copy of spfx-rea (`1.24.0-rspack.9`): hint printed for an added `config/spfx-customize-webpack.js`, an extend file with `rspack.DefinePlugin` (`CONTOSO_API` from a CommonJS helper using `__dirname`, `CONTOSO_PORT` from the context) and an `@src` alias rendered `api=https://api.contoso.com/v1 from config port=4433` in a web part, helper and extend edits showed new values after the automatic reload, a broken edit kept server and page with the code-frame error, `devServer.port` warned and `devServer.headers` was served
- Confidence: high
- Last checked: 2026-11-19
