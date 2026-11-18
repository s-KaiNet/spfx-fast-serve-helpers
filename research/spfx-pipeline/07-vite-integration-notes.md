# 07 — Notes for a Vite-based builder

> Experiment files, logs and captures referenced here were removed from the repo in a cleanup; they are in git history at commit `dd4da8d`.

What SharePoint actually requires is narrow. Everything below "contract" is what the runtime (05) checks; the rest of the
Heft/webpack machinery is replaceable. Items are tagged **O** (observed), **S** (read in code) or **I** (inference / design proposal, not yet tested).

## The runtime contract (what a build must emit)

| # | Requirement | Why | Tag |
|---|---|---|---|
| C1 | A **classic script** (not `type=module`) that calls `define(...)` synchronously when executed | RequireJS loads `paths[id]` with a `<script>` tag and expects a `define` before the `load` event | S/O |
| C2 | Module id `"<manifest.id>_<manifest.version>"` (named define), or anonymous define | Loader `require(["<id>_<ver>"])`; anonymous define is named from `data-requiremodule` by RequireJS; mismatched names trigger `_loadWithDifferentModuleId` fallbacks | S (anonymous: I) |
| C3 | `define` deps = **bare specifiers exactly equal to `scriptResources` keys** (`react`, `react-dom/client`, `@microsoft/sp-webpart-base`, `HelloWorldWebPartStrings`, …) | resolution is RequireJS `map["<id>_<ver>"][specifier]` | O |
| C4 | Factory returns a module whose **`default` is the component class** (or `loaderConfig.exportName` property) | sp-webpart-base `_initializeWebPart` | S |
| C5 | Framework packages + React must be **external** (never bundled) and declared as `{type:"component", id, version}` with the component GUIDs (list in 02) | shared singletons (React, service scope, page context) come from the page; versions resolve to tenant's (same major, ≥) | O |
| C6 | `manifest.json` per component (02/03 schema) with `loaderConfig.internalModuleBaseUrls`, `entryModuleId`, `scriptResources` | the only thing the loader reads | O |
| C7 | Asset URLs relative to the script's own location at runtime (`document.currentScript`), not a fixed `base` | the same build is served from localhost, ClientSideAssets or a CDN | O |
| C8 | CSS injected from JS (no CSS file reference in manifest); theme tokens `"[theme:x, default:y]"` need `@microsoft/load-themed-styles` `loadStyles` | sp-css-loader behaviour; manifest has no CSS resource type | S |
| C9 | Localized strings as separate `define([], () => ({...}))` files referenced by `type:"path"`/`"localizedPath"` (or bundle them and drop the external) | LegacyExternals | S |
| C10 | Debug: an AMD `manifests.js` whose module has `getManifests()` returning the array of **your** manifests with absolute `internalModuleBaseUrls` (framework manifests are ignored on SPO pages anyway) | debug handler | O/S |
| C11 | Debug server on **`localhost`** (`https://localhost:*` or `http://localhost:*`; not `127.0.0.1`), CORS `*`, ideally `Access-Control-Allow-Private-Network: true` | CSP + LNA | O |
| C12 | Package: `release/manifests/*.manifest.json` + `release/assets/**` → `heft package-solution --production` (independent phase, does not run webpack) | SolutionPackager reads only those folders + `config/package-solution.json` + `teams/` | S |

## Build (production) with Vite/Rollup — sketch (I)

- `build.lib` / `rollupOptions.input` = TS entry per bundle (no need for the `lib/` tsc step; run `tsc --noEmit` separately for type-checking since esbuild doesn't type-check).
- `rollupOptions.output.format: "amd"`, `output.amd.id: "<id>_<ver>"` (C2), `exports: "named"` (default export preserved → C4).
- `rollupOptions.external`: compute the same set as SPFx (02) — `@microsoft/spfx-heft-plugins` publicly exports `CumulativeManifestProcessor` + `DependencyDiscoveryMode` and the non-standard React map is small → C5, C3.
- Emit `<id>.manifest.json` from the source manifest + the bundle's external list (mirror `ManifestPlugin._getExternalsScriptResourcesAsync`), write release copy with `cdnBasePath`, dev copy with `https://localhost:<port>/dist/`.
- Assets: `experimental.renderBuiltUrl` → runtime expression based on a `__currentScriptBase` captured at the top of the bundle (C7) — same trick as `SetPublicPathCurrentScriptPlugin`.
- CSS: custom plugin turning CSS (modules → hashed names) into `loadStyles(css, true)` calls; keep `cssCodeSplit` off / inject (C8).
- **Code-splitting risk**: Rollup AMD dynamic imports emit `require(['./chunk-x'], …)`; RequireJS resolves `./chunk-x` relative to the *module id* (`<guid>_<ver>`) against `baseUrl = https://relative-path.invalid` → broken. Options: `inlineDynamicImports`, or a `renderDynamicImport` hook that loads chunks by absolute URL from `__currentScriptBase` (e.g. via `import()` of ES chunks or `require([absoluteUrl])`).
- Dynamic imports *of SPFx components* (`import('@microsoft/sp-...')`) should map to `SPComponentLoader.loadComponentById` like `AsyncComponentPlugin` does.
- Output `es2017+` is fine for the SPO browser matrix (assumption — SPFx rig still targets ES5 via tsc).

## Dev mode options

### Option A — `vite build --watch` + static HTTPS server (lowest risk)
Same output as production but unminified with source maps, served from `https://localhost:4321/dist/` + `temp/build/manifests.js`. Reload on rebuild (WebSocket ping script or plain manual reload). Matches what Heft does today functionally (Heft's HMR always ends in a full reload anyway — F13).

### Option B — real Vite dev server (native ESM, on-demand transforms)
Feasibility probe (**O**; sources in artifacts/esm-probe/, served temporarily from `temp/rea-probe/`): inside the debug page,

```js
import("https://localhost:4321/temp/rea-probe/esm-probe.js")
// esm-probe.js: import {dep} from './esm-dep.js'; …window.require.defined('0d910c1c-…_18.3.1')…
// → "esm-ok:dep-ok:function:true react=18.3.1"
```

So: CSP allows ES modules from localhost, relative ESM imports work, and ESM code can synchronously read SPFx AMD modules via `window.require("<id>_<ver>")` once they are defined.

Proposed shape (I):
1. Vite middleware serves `/dist/<bundle>.js` as a tiny **AMD shim** (C1–C4):
   ```js
   define("vite-esm", [], () => ({ load(url, parentRequire, onload) {
     // parentRequire is scoped to the component → RequireJS map applies → correct tenant versions
     parentRequire(["react","react-dom/client","@microsoft/sp-core-library","@microsoft/sp-webpart-base", /*…*/],
       (...deps) => { window.__spfxExternals ??= {}; window.__spfxExternals["<id>_<ver>"] = { react: deps[0], /*…*/ };
                      import(url).then(onload, onload.error); });
   }}));
   define("<id>_<ver>", ["vite-esm!https://localhost:5173/src/webparts/helloWorld/HelloWorldWebPart.ts"], (m) => m);
   ```
   RequireJS loader plugins may resolve asynchronously, which solves "ESM is async but `define` must be sync".
2. In the ESM graph, Vite resolves externals (`react`, `@microsoft/sp-*`, `*Strings`) to virtual modules that re-export from `window.__spfxExternals[...]` (named exports generated from the installed package's export list).
3. `manifests.js` generated by the plugin, pointing `internalModuleBaseUrls` at the Vite server.
4. HMR: Vite client over WebSocket (no `connect-src` in SPO CSP → allowed). React Fast Refresh needs a *development* React renderer; the page supplies SharePoint's `react-18-bundle` (likely a production build) → expect Fast Refresh to fail; fall back to re-rendering the web part (call `render()`), or full reload. **Unverified.**

Open questions for B: `import.meta.url`-based assets work naturally in ESM; CSS via Vite's style injection works but theme tokens still need `loadStyles`; the "Allow debug scripts?" prompt and debug query string remain mandatory (CSP).

## Things that must not be forgotten

- Keep component **id/version stable**; the page stores only the id, the loader picks the highest same‑major version (debug manifests win).
- React/ReactDOM versions: manifest version must be one the tenant can satisfy (18.3.1 here); `react-dom/client` external only exists for React ≥ 18.
- `HelloWorldWebPartStrings` style AMD loc modules are required unless the import is aliased to bundled JSON.
- `dist/` overwritten by serve; `release/` is what packaging reads.
- Browser setup for devs: trust the dev cert, allow Local Network Access prompt, always use the debug query string (sessionStorage stickiness otherwise causes CSP errors).
