# 05 — Runtime: how SharePoint loads the component

Sources: live page (agent-browser + raw CDP), sanitized network extracts in [artifacts/network/](artifacts/network/), RequireJS snapshot [artifacts/runtime-requirejs-config.json](artifacts/runtime-requirejs-config.json), and the shipped loader `node_modules/@microsoft/sp-loader/dist/sp-loader-assembly_en-us.js` + `chunk.sp-loader-debug-handlers_*.js` (1.24.1; minified, pretty-printed for reading; the tenant ran 1.25.0 — the behaviour seen live matched the 1.24.1 code paths below).

## 1. Page bootstrap (observed in the HTML of `spfx-rea.aspx`)

1. Inline nonce'd script: creates `<script crossorigin src=".../sp-pages-assembly_1_en-us_<hash>.js">`; on error redirects with `?sw=bypass&bypassReason=assemblyLoadFailure` (query string preserved).
2. Inline `const spClientSidePageContext = { user, spPageContextInfo, manifests:[…preloaded…], CanvasContent1:"[…]", … }`.
3. `spModuleLoader.initializeFlightsAndKillswitches(...)`, creates an `AadTokenProvider` from `spModuleLoader._bundledComponents['8496636c-…']`, then `window.moduleLoaderPromise = spModuleLoader.start(spClientSidePageContext)`.
4. The page canvas JSON contains our web part instance:
   `{"controlType":3,"webPartId":"2997f152-…","webPartData":{"id":"2997f152-…","instanceId":"154ef451-…","title":"HelloWorld","properties":{"description":"HelloWorld"},"dataVersion":"1.0","serverProcessedContent":{…}}}` — only the **component id** is stored, no version and no URL.

`sp-pages-assembly` contains sp-loader. sp-loader creates RequireJS **2.3.7** from an embedded source string (the `blob:https://mastaq.sharepoint.com/<uuid>` script requests in the network log) and configures it (`ModuleLoader` constructor):

```js
requirejs.config({ waitSeconds: 90, baseUrl: "https://relative-path.invalid", onNodeCreated(node, cfg, moduleName, url){
  /* perf marks; crossorigin="anonymous" for CDN / SRI scripts; integrity=<sha256> when manifest provided it (flight 60737) */ } })
```

## 2. Debug manifests flow (`chunk.sp-loader-debug-handlers`)

```
query ?debugManifestsFile=<url> (&loader=<url> optional custom sp-loader) &debug=true &noredir=true
 → handleNonTestModeDebug(): compare with sessionStorage["spfx-debug"]; console.debug("[SPFx Debug]", {...})
 → confirmDebugAllowedAsync(): show "Allow debug scripts?" unless already allowed for this URL
 → getDebugScripts(): loadScript(loaderUrl, {globalExportsName:"spModuleLoader"}) and/or loadAndRegisterManifestsFileAsync(manifestsUrl)
 → loadAndRegisterManifestsFileAsync: moduleLoader.loadScript(url)  // RequireJS require([url]) → AMD module → .getManifests()
       if (!_metadata.isFirstParty):
          keep manifest only if !m.isInternal && !store.tryGetManifest(m.id)?.isInternal     ← framework manifests dropped
          log "SPFxDebugging/ThirdPartyManifestsLoaded" counts
       ManifestStore.registerDebugManifests(kept)        // addManifests(list, …, isDebug=true)
 → persist sessionStorage["spfx-debug"] = {liveReload, loaderUrl, manifestsFileUrl, hasLogged3pDebug}
 → on failure: dialog "Error loading debug manifests." (+ "Error loading debug script. Ensure the server is running and the \"debugManifestsFile\" parameter URL is correct.")
```

Effect observed: of the 17 manifests in `manifests.js` only `HelloWorldWebPart` mattered; **no `/node_modules/@microsoft/sp-*` file was ever requested from localhost**. The web part appeared in the toolbox ("Add web part HelloWorld").

## 3. Manifest store & version resolution

`ManifestStore.getManifest(id, version)` (sp-loader):
- Candidates = all stored manifests for `id` (preloaded, fetched, debug).
- `q(candidate, requested) = (candidate > requested && candidate.major == requested.major) || candidate == requested`.
- Picks the highest qualifying version; once a **debug** manifest qualifies, only debug manifests can replace it → debug wins over a deployed version.
- If none: throws `Cannot find manifest for <id>_<ver>. Store had [...]` (pinned) / requests it via `GetClientSideComponents`.

Live result: the bundle asked for `@microsoft/sp-core-library 1.24.1`, `sp-webpart-base 1.24.1`, `sp-property-pane 1.24.1`, `sp-lodash-subset 1.24.1` → resolved to **1.25.0** (tenant). `react 18.3.1` and `react-dom/client 18.3.1` → exact. `react-dom/client` was not preloaded, so the loader POSTed `GetClientSideComponents {"components":[{"id":"3cadd7f5-…","version":"18.3.1"}]}` and then loaded `react-dom-client-18-bundle_none_67888f69ed394db31937.js` from the CDN with SRI.

## 4. Manifest → RequireJS configuration (`configLoadComponent`)

For component `C` with manifest `M`:

```
for each [name, res] of M.loaderConfig.scriptResources:
  res.type == "component":  dep = store.requestManifest(res.id, res.version)   (may hit GetClientSideComponents)
                            map[name] = "<dep.id>_<dep.version>"   (+ failoverPath → paths[name])
  res.type == "path"/"localizedPath":
      moduleId = name == M.loaderConfig.entryModuleId ? "<M.id>_<M.version>" : "<M.id>_<M.version>/<name>"
      url      = internalModuleBaseUrls[0] + path   (".js" stripped; localizedPath by UI culture)
      paths[moduleId] = url;  map[name] = moduleId  (non-entry)
      globalName → shim[moduleId] = {exports: globalName, deps: globalDependencies}   (jquery/yammer special-cased)
requirejs.config({paths}); then requirejs.config({ map: { "<M.id>_<M.version>": map } })
if window.__spfxPreloadedModules[moduleId] → define(...) it directly (server-side preloading path)
```

Snapshot taken live after the web part rendered ([runtime-requirejs-config.json](artifacts/runtime-requirejs-config.json)):

```jsonc
"paths": {
  "2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1":                          "https://localhost:4321/dist/hello-world-web-part",
  "2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1/HelloWorldWebPartStrings": "https://localhost:4321/dist/HelloWorldWebPartStrings_en-us",
  "3cadd7f5-5449-49c4-a153-1beb8facd90a_18.3.1": "https://res-1.cdn.office.net/files/sp-client/react-dom-client-18-bundle_none_67888f69ed394db31937",
  "f9e737b7-f0df-4597-ba8c-3060f82380db_1.25.0": "https://res-1.cdn.office.net/files/sp-client/sp-property-pane_en-us_c4449716fcd9eaf7b0c3" },
"map": { "2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1": {
  "HelloWorldWebPartStrings":    "2997f152-d79f-45c7-a7d2-ea768b8f5575_0.0.1/HelloWorldWebPartStrings",
  "react":                       "0d910c1c-13b9-4e1c-9aa4-b008c5e42d7d_18.3.1",
  "react-dom/client":            "3cadd7f5-5449-49c4-a153-1beb8facd90a_18.3.1",
  "@microsoft/sp-core-library":  "7263c7d0-1d6a-45ec-8d85-d4d1d234171b_1.25.0",
  "@microsoft/sp-property-pane": "f9e737b7-f0df-4597-ba8c-3060f82380db_1.25.0",
  "@microsoft/sp-webpart-base":  "974a7777-0990-4136-8fa6-95d80114c2e0_1.25.0",
  "@microsoft/sp-lodash-subset": "73e1dc6c-8441-42cc-ad47-4bd3659f8a3a_1.25.0" } }
```

Script tags created by RequireJS: `data-requiremodule="2997f152-…_0.0.1" src="https://localhost:4321/dist/hello-world-web-part.js"` (no `crossorigin`, no `integrity`), CDN ones with `crossorigin="anonymous" integrity="sha256-…"`.

This is the crux: **the bundle's bare `define()` dependencies are rewritten per-component by RequireJS `map`**, so the same specifier can resolve to different versions for different components.

## 5. Loading and instantiation

- `SPComponentLoader.loadComponent(manifest)` → `configLoadComponent` → `require(["<id>_<ver>"])`. RequireJS loads the script; the named `define("<id>_<ver>", deps, factory)` registers it; deps are loaded through `map`/`paths`. If the loaded script defines a *different* name (`_loadWithDifferentModuleId`), the loader searches the registry for a module with the same GUID and re-maps — so name mismatches are partly tolerated (I).
- `loaderConfig.exportName` (multi-component bundles) picks a property of the module.
- sp-webpart-base `_initializeWebPart(module)`: `c = module; if (c.default && typeof (c = c.default) !== "function" && c.default) c = c.default;` → **class constructor = default export**, then `new c()`, `_internalInitialize(context…)`, `onInit()` (Promise), `render()` into `domElement`.
- Public path: bundle captured `document.currentScript.src` → `https://localhost:4321/dist/` → images resolve to `https://localhost:4321/dist/welcome-light_<hash>.png` (observed).
- CSS: injected as `<style>` by bundled load-themed-styles (`loadStyles(css, true)`), theme tokens replaced with the page theme.

## 6. Timeline (view-mode load with web part on the page, debug on)

From [har-03 extract](artifacts/network/har-03-debug-viewmode-load.requests.json):

| t (ms) | Request |
|---:|---|
| 0 | `GET spfx-rea.aspx?debugManifestsFile=…` (CSP allows localhost) |
| 507 | `blob:` RequireJS |
| 529 | `sp-pages-assembly_1_en-us_….js` (CDN) |
| 936 | `chunk.sp-loader-debug-handlers_none_….js` |
| 974 | `https://localhost:4321/temp/build/manifests.js` |
| 1233–1405 | ~20× `POST _api/web/GetClientSideComponents` (page + framework) |
| 1290 | `https://localhost:4321/dist/hello-world-web-part.js` |
| 1291 | `https://localhost:4321/dist/HelloWorldWebPartStrings_en-us.js` |
| 1586 | `react-dom-client-18-bundle_none_….js` (CDN) |
| 1888 | `https://localhost:4321/dist/welcome-light_….png` |

Screenshots: [web part added in edit mode](artifacts/03-webpart-added-edit.png), [view mode](artifacts/05-viewmode-webpart-from-localhost.png).

## 7. Other loader facts noted in code (not exercised)

- `?loader=<url>` replaces sp-loader itself with a debug build (`delete window.spModuleLoader; loadScript(url, {globalExportsName:"spModuleLoader"})`).
- `evalDebugAssemblies` iframe flow evaluates debug *assemblies* (manifests with `rootComponentId`) in a hidden iframe before trusting them.
- `SystemJsFallbackLoader` chunk (`systemjs-component-loader`) exists as alternative executor.
- `window.__spfxPreloadedModules` lets the server inline module factories.
- Same-origin `.html` SitePages in debug take a different branch (`pathname.indexOf(".html")`).
