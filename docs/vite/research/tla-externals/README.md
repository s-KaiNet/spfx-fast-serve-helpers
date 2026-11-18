# On-demand SPFx externals via top-level await (TLA)

> Experiment files, logs and captures referenced here were removed from the repo in a cleanup; they are in git history at commit `dd4da8d`.

Date: 2026-11-15. Tenant: mastaq.sharepoint.com (SPO build odsp-web-prod_2026-10-30.006, every `@microsoft/sp-*` at **1.25.0**).
Project: SPFx **1.24.1**. Vite 8.3.8, Rolldown 1.2.19, headless Chrome 153.

Tags: **L** = verified live on the SharePoint page, **O** = verified offline (Node/Rolldown), **I** = inferred.

## Recommendation: GO, with conditions

Facades that do `const m = await window.__spfxVite.require('<pkg>')` work in the page, give the tenant version, and
share the page's instances. They also remove the "new SPFx import, reload the page" limitation (it hot-updates now).
Conditions:

1. **Resolve every package with `SPComponentLoader.loadComponentById(id, version)`**, with `id`/`version` read from
   `node_modules/<pkg>/dist/*.manifest.json`. Don't rely on the component-scoped RequireJS `require`. The scoped
   `require` only knows names listed in `scriptResources`, and listing a library there makes SharePoint load it eagerly.
2. **Don't list sp-* libraries in the debug manifest** (or list only `@microsoft/sp-loader`, to get `SPComponentLoader`
   through the scoped `require`). The shim then just installs `__spfxVite.require` and `import()`s the entry.
   It doesn't need to preload anything. Optionally it can fire non-blocking warm-up requests.
3. **Pre-bundled third-party deps need two facades.** ESM importers get the TLA facade. `require()` importers
   (CommonJS) get a sync facade plus a chunk-level `await preload([...])`. A plain TLA facade makes Rolldown fail on
   CJS with `REQUIRE_TLA`. Prepend one parallel `preload` per chunk, otherwise the bundled awaits run one after another.
4. **Fix error reporting before shipping.** The console and the Vite terminal show the real cause. The web part's
   "Something went wrong → Technical details" shows only `ERROR: [object Object]`.
5. **Version policy.** If the project needs a newer library than the tenant has, `loadComponentById` fails with
   `Cannot find manifest for <id>_<ver>. Store had [1.25.0]`, same as production. Keep that behaviour, or add an opt-in
   dev fallback that loads without a version and logs a warning.

## Evidence

Prototype: proto/, a copy of the PoC plugin with switches. Run it from the repo root:
`TLA_PROBE=1 [TLA_MANIFEST=used|all|none] [TLA_PRELOAD=1] [TLA_BREAK=<pkg>] node_modules/.bin/vite --config research/tla-externals/proto/vite.config.mjs` (port 4331).
- proto/plugin.mjs: `renderShim` (the `__spfxVite` runtime with 3 resolve strategies: `scoped`, `byId`, `global`),
  `renderExternalModule` (TLA facade), and an `optimizeDeps.rolldownOptions.plugins` entry.
- proto/probe.ts runs after the entry. It uses fake-spfx-dep, a pre-bundled
  "third-party" package that imports sp-core-library and sp-http, with an import cycle. It also does dynamic imports and
  mounts ProbeCounter.tsx for HMR.
- Pre-bundled output of the fake dep: evidence-fake-spfx-dep.prebundled.js.
- Rolldown edge cases: rolldown-tests/run.mjs, results in rolldown-tests/results.txt.

### 1. Works in the page: versions and instances (L)

`TLA_MANIFEST=used` (manifest lists the 5 libraries `src/` imports):
- The RequireJS `map` for `2997f152-…_0.0.1` maps all 5 names to `_1.25.0` (project asks for 1.24.1).
- The web part rendered, with pageContext and loc strings.
- These are the same objects as `window.require('<id>_1.25.0')`:

| Import | How loaded | Same object as `window.require('<id>_1.25.0')` |
|---|---|---|
| sp-core-library, sp-property-pane, sp-webpart-base, sp-lodash-subset (src, static) | scoped `require` | yes (web part works with the page's ServiceScope) |
| sp-core-library `Version` inside the pre-bundled fake dep | scoped | **true** |
| sp-http inside the fake dep (not in the manifest, already loaded by the page) | `byId` | **true** |
| `await import('@microsoft/sp-property-pane')` | scoped | **true** (15–21 ms) |
| `await import('@microsoft/sp-dynamic-data')` (not in the manifest) | `byId` | **true** (19–45 ms) |
| sp-top-actions (**not loaded by the page**), loaded by `byId` | network: `res-1.cdn.office.net/.../sp-top-actions_none_3e447b….js` | **true**, 8 ms, version 1.25.0 |

The 4 static facades start in the same millisecond and finish within 25–28 ms (cold) or 8–28 ms (reloads).
Native ESM evaluates sibling async modules in parallel.

### 2. Packages not in the manifest (L)

| Strategy | Already loaded (sp-http) | Not loaded (sp-top-actions) |
|---|---|---|
| scoped `require('@microsoft/sp-x')` | **fails** in 11 ms: RequireJS `scripterror`. It fetches `https://relative-path.invalid/@microsoft/sp-http.js`. Fast, no hang | **fails** in 8 ms, same way |
| `SPComponentLoader.loadComponentById(id, '1.24.1')` | 1.25.0 instance, 1 ms | loads from the CDN, 1.25.0, same instance, 8 ms |
| `window.require('<id>_<highest same-major defined>')` | works | **rejects**: not defined. It can't load anything |
| list every SPFx library in the manifest (`TLA_MANIFEST=all`, 14 libraries) | works through scoped | works, but **sp-top-actions is fetched from the CDN on every page load** even though nothing imports it. The loader loads all `scriptResources` components eagerly |

`loadComponentById` version rules (L):
- `(core, '1.99.0')` and `(core, '2.0.0')` fail with `Cannot find manifest for 7263…_1.99.0. Store had [1.25.0]`.
- With no version it returns 1.25.0.

So a requested `1.24.1` resolves to the tenant's newer same-major version, and a newer requested version fails.

`TLA_MANIFEST=none` (no sp-* in the manifest, everything through `byId`, `SPComponentLoader` taken from the page's
defined sp-loader): the web part rendered, the `map` was `{}`, and all instance checks were true.

### 3. Dynamic import (L)

`import('@microsoft/sp-property-pane')` resolves to the same facade module. Its TLA settles before `import()` resolves.
The PoC error "was not preloaded by SharePoint" is gone. This matches what `AsyncComponentPlugin` does in production
(`loadComponentById`).

### 4. TLA in Rolldown dependency pre-bundling (O + L)

- Live: `fake-spfx-dep` was pre-bundled with the facades inlined. The output is flat (scope-hoisted), and the
  facade awaits stay at the top level in import order.
- The ESM cycle `cycle-a ↔ cycle-b`, where cycle-b awaits a facade, evaluated correctly (`A(B(a),b:function)`).
- Offline cases (results.txt). Each fake `require` takes 50 ms. 3 s timeout = deadlock detector:

| Case | Plain TLA facade | Sync facade for `require()` + one parallel preload per chunk |
|---|---|---|
| ESM cycle, TLA module inside it | OK, 52 ms | OK |
| entry is part of the cycle, TLA module imports the entry | OK | OK |
| same module imported statically and dynamically (3 chunks) | OK, TLA kept in shared chunks | OK |
| `export *` from a facade + CJS interop wrapper | OK | OK |
| **CJS `require('@microsoft/sp-core-library')`** | **build error `[REQUIRE_TLA]`** | OK |
| ESM + CJS mixed in one dep | **build error** | OK, 52 ms (104 ms without the parallel preload) |
| 3 sibling sp-* imports in one dep | OK but **sequential: 154 ms** | **52 ms** |

No deadlocks. A TLA deadlock needs a module to await something that depends on the module itself. The facades only
await RequireJS, which is outside the ESM graph, so no cycle can pass through them. The one way to deadlock would be a
facade awaiting the component's own `<id>_<ver>` (I).

Minor: Rolldown keeps every unused export read (`m["DisplayMode"];`), because property reads might have side effects.
It's harmless bloat. Use `treeshake.propertyReadSideEffects: false` for deps, or emit only the names the importer
uses (I).

### 5. HMR / Fast Refresh and load time (L)

- **Fast Refresh** of a component that imports a facade: the label changed, `count=3` was kept, and the facade was
  not re-evaluated (the load log didn't change).
- **Adding a new SPFx import during the session:**
  - `sp-page-context` (loaded by the page, never imported before) hot-updated, state kept, no reload.
  - `sp-top-actions` (**not loaded by the page**): the hot update fetched it from the CDN in 5 ms, state kept (`count=2`), no reload.

  The PoC needs a page reload in both cases.
- Pitfall seen: a non-component export (`export const LABEL`) breaks the Fast Refresh boundary, and the change
  propagates to the entry's `location.reload()`. This is normal Vite behaviour, not TLA-specific.
- **Load time** (performance.now() in ms, warm Vite, 3 reloads each; SharePoint page noise is ±500 ms):

| Mode | shim fetched | entry `import()` starts | entry resolved | gap shim → import |
|---|---|---|---|---|
| used manifest, TLA, no preload | 1279–1366 | 2063–2142 | 2752–2870 | ~700–780 |
| used manifest, shim preload (current PoC flow) + TLA | 1190–1464 | 1846–2514 | 2362–3599 | ~650–1050 |
| all 14 libraries in the manifest | 1325–2028 | 2067–3008 | 2702–3996 | ~700–1100 |
| **none in the manifest, all `byId`** | 1254–1303 | **1538–1676** | **2442–2764** | **~250–420** |

  Listing externals in the manifest makes the loader resolve them before it runs the shim, which costs ~400 ms here.
  Without the listing, the facades resolve already-loaded libraries in about 1 ms each. TLA adds no measurable cost.
- Libraries the page hasn't loaded are fetched only when their facade evaluates, which is after Vite has served the
  module graph (~800 ms in). The shim can start them earlier with non-blocking `__spfxVite.require(name)` calls next to
  the `import()` (I).

### 6. Error reporting (L)

`TLA_BREAK=@microsoft/sp-lodash-subset` makes the project ask for 9.0.0:
- The console and the Vite terminal (Vite 8 forwards browser console output) show
  `[spfx-serve-tla] cannot load SPFx library "@microsoft/sp-lodash-subset" (byId): Cannot find manifest for 73e1…_9.0.0. Store had [1.25.0]`,
  with the facade URL in the stack. SharePoint adds `Could not load hello-world-web-part in require. Error: …`.
- The web part shows "Something went wrong". Its Technical details read only `ERROR: [object Object]`. The current
  PoC has the same problem for any `import()` failure, because it uses the same `onload.error` path.
- ESM caches evaluation errors: once a facade fails, that module stays failed until the page reloads. HMR can't
  recover it, because the facade URL never changes (I, standard ESM semantics).

## Design sketch

```js
// /@spfx/component/<id>.js  (classic script; manifest scriptResources = { [bundle]: shim } or + "@microsoft/sp-loader")
var sv = window.__spfxVite || (window.__spfxVite = { cache: {} });
sv.libraries = { "@microsoft/sp-http": { id: "c07208f0-…", version: "1.24.1" }, … }; // every SPFx Library in node_modules
sv.require = sv.require || function (name) {
  return sv.cache[name] || (sv.cache[name] = sv.loader().then(function (L) {
    var lib = sv.libraries[name];
    if (!lib) throw new Error('"' + name + '" is not an SPFx library in node_modules');
    return L.SPComponentLoader.loadComponentById(lib.id, lib.version);
  }).catch(function (e) { throw new Error('[spfx-serve] cannot load "' + name + '": ' + e.message); }));
};
sv.preload = function (names) { return Promise.all(names.map(sv.require)); };
sv.loaded = function (name) { /* sync registry for CJS facades, filled when require() settles */ };
define("spfx-vite-loader-<id>", [], function () { return { load: function (name, req, onload) {
  sv.loader = sv.loader || function () { return new Promise(function (ok, ko) { req(["@microsoft/sp-loader"], ok, ko); }); };
  // (optional) warm-up without blocking: sv.require("@microsoft/sp-webpart-base");
  import(ORIGIN + name).then(onload, function (e) { onload.error(e); });
} }; });
define("<id>_<ver>", ["spfx-vite-loader-<id>!/@spfx-entry/<id>"], function (m) { return m; });
```

```js
// ESM facade (Vite dev graph and optimizeDeps, for import/export importers)
const m = await window.__spfxVite.require("@microsoft/sp-http");
export default (m.default !== undefined ? m.default : m);
export const SPHttpClient = m.SPHttpClient; /* …names from the package's ESM entry… */

// CJS facade (optimizeDeps only, resolveId kind === 'require-call')
module.exports = window.__spfxVite.loaded("@microsoft/sp-http");
// + renderChunk: prepend `await window.__spfxVite.preload([...every sp-* module in the chunk])`
```

What the shim no longer needs: the `usedExternals` source scan, the manifest rescan on each request, and preloading.
What stays: discovering SPFx libraries (id/version) in `node_modules`, and the export-name list per package.

## Risks

- **Evaluation order.** A module that imports a facade evaluates after that library is loaded, the same guarantee
  as before for that module. Unrelated sibling modules may now run earlier than SPFx libraries they don't import.
  Code that relied on a library being loaded as a side effect, without importing it, could break (I, rare).
- **Side-effect packages** (`sp-office-ui-fabric-core` injects CSS; side-effect-only `import '…'`): the facade still
  awaits the load, and AMD modules are singletons, so only the timing changes (I).
- **Type-only imports** (`IReadonlyTheme` from sp-component-base) are erased, so nothing is loaded. Production webpack
  behaves the same (L: sp-component-base never went through a facade).
- **Third-party SPFx library components** (non-Microsoft libraries in node_modules) depend on `loadComponentById`
  finding their manifest in the tenant (app catalog). Not tested.
- **Multiple components on one page** share one `__spfxVite`, and the first loader wins. That's fine because the
  resolution doesn't depend on the component's `map` (I).
- **Errored facades** stay errored until reload. Error UI shows `[object Object]` (see 6).
