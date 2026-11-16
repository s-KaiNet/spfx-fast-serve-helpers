# 03 — Component manifests and `manifests.js`

## Source manifest → emitted manifest

Source: `src/webparts/helloWorld/HelloWorldWebPart.manifest.json` (id `2997f152-d79f-45c7-a7d2-ea768b8f5575`, `version: "*"`, `componentType: WebPart`, `preconfiguredEntries`, `supportedHosts`, …).

`ManifestPlugin` (`spfxManifests/webpack/ManifestPlugin.js`) emits `dist/2997f152-….manifest.json`:

```jsonc
{
  "id": "2997f152-d79f-45c7-a7d2-ea768b8f5575", "alias": "HelloWorldWebPart",
  "componentType": "WebPart", "version": "0.0.1",          // "*" → package.json version
  "manifestVersion": 2, "requiresCustomScript": false,
  "supportedHosts": ["SharePointWebPart","TeamsPersonalApp","TeamsTab","SharePointFullPage"],
  "preconfiguredEntries": [ … title/description/group localized as {"default": …} … ],
  "loaderConfig": {
    "internalModuleBaseUrls": ["https://localhost:4321/dist/"],   // debug; release = write-manifests.json cdnBasePath
    "entryModuleId": "hello-world-web-part",                      // = bundle name = key in scriptResources
    "scriptResources": {
      "hello-world-web-part":       { "type": "path", "path": "hello-world-web-part.js" },
      "react":                      { "type": "component", "id": "0d910c1c-…", "version": "18.3.1" },
      "react-dom/client":           { "type": "component", "id": "3cadd7f5-…", "version": "18.3.1" },
      "@microsoft/sp-core-library": { "type": "component", "id": "7263c7d0-…", "version": "1.24.1" },
      "@microsoft/sp-property-pane":{ "type": "component", "id": "f9e737b7-…", "version": "1.24.1" },
      "@microsoft/sp-webpart-base": { "type": "component", "id": "974a7777-…", "version": "1.24.1" },
      "HelloWorldWebPartStrings":   { "type": "path", "path": "HelloWorldWebPartStrings_en-us.js" },
      "@microsoft/sp-lodash-subset":{ "type": "component", "id": "73e1dc6c-…", "version": "1.24.1" }
    }
  }
}
```

### `scriptResources` entry types (as produced/consumed)

| type | Fields | Meaning at runtime |
|---|---|---|
| `path` | `path` (string or `{path, integrity}`), optional `globalName`, `globalDependencies` | file under `internalModuleBaseUrls[0]`; entry bundle or extra AMD/global script |
| `localizedPath` | `paths: {locale: file}`, `defaultPath` | loader picks by page UI culture |
| `component` | `id`, `version`, optional `failoverPath`, `conditionalOverrides`, `fallbackVersion` | another SPFx component, resolved via the manifest store (same major, ≥ version) |

Production adds hashes to paths; with `_includeIntegrityInManifestPaths` it would emit `{path, integrity:"sha256-…"}` (Microsoft's own manifests in the tenant do this — see [artifacts/network/GetClientSideComponents-react-dom-client.json](artifacts/network/GetClientSideComponents-react-dom-client.json)).

### Debug vs release variant

One `processAssets` run builds the manifest twice (`DevReleaseManifestSource`):
- **debug** (`dist/…manifest.json`): `internalModuleBaseUrls = ["<serve.json https?>://<hostname|localhost>:<port|4321>/dist/"]`
- **release** (`release/manifests/…`): `internalModuleBaseUrls = [write-manifests.json cdnBasePath]` (here the template placeholder `<!-- PATH TO CDN -->`; package-solution later replaces it, see 06).

### String localization in manifests

Any `{ "id": "$<relative loc file>:<key>;" }` value in title/description/group/tags (and command set items) is resolved at build time into `{ default, <locale>: … }`. `iconImageUrl` can point to a local file → emitted as asset (`IconHandler`).

## `temp/build/manifests.js`

Written by `CumulativeManifestProcessor.generateCumulativeManifestAsync` + `ManifestsFileBuilder`. It is an **AMD module** (no name) built by webpack:

```js
(()=>{ … publicPath from currentScript …;
  const t=[ /* every debug manifest: own components + all SPFx packages found in node_modules */ ];
  const a={ _metadata: undefined, getManifests(){ /* clone; expand compact localizedPath {p,l,s}; if a manifest has
       no internalModuleBaseUrls use the manifests.js folder; ?locale=/?market= collapses localizedPath → defaultPath */ return … } };
  self.debugManifests=a; define([],()=>a); })();
```

Contents in this project: 17 manifests — `HelloWorldWebPart@0.0.1` plus 16 framework manifests (`SPCoreLibrary@1.24.1`, `SPWebPartBase@1.24.1`, …, `sp-loader-assembly@1.0.0`) whose base URL was rewritten to `https://localhost:4321/node_modules/@microsoft/<pkg>/dist/`. (The serve map exposes those folders, so in a workbench‑like host they could be loaded locally; on a real SharePoint page they are discarded, see 05.)

Discovery modes (`DependencyDiscoveryMode`): `deepSparseIgnoreFirstProject` (default here: walk package.json deps recursively, read `dist/*.manifest.json`), `shallow` (read `temp/build/manifests.json` of each dep — used with `_useManifestsJsonForComponentDependencies`).

## `release/component-dependency-audit/spfx-rea.json`

For each bundle: list of `{componentId, componentName, componentVersion, isDirectDependency}` including transitive framework components (e.g. `@msinternal/odsp-core-bundle 1.5.229`, `react 17.0.1` *and* `18.3.1`), plus `asyncChunks` deps. Diagnostic only.

## Tenant-side manifests

The page itself gets manifests from three places (observed):
1. Inline in the HTML: `spClientSidePageContext.manifests` (preloaded app/framework manifests).
2. `POST /_api/web/GetClientSideComponents` with `{"components":[{"id","version"}], "project": "<app id>"}` → `{"value":[{"Id","ComponentType","Manifest":"<json string>","Status"}]}` — on demand for unknown ids (e.g. `react-dom/client 18.3.1` when our web part was added). Response also includes transitive manifests.
3. `GetClientSideComponentsByComponentType(...)` for the toolbox; plus the debug manifests file.
