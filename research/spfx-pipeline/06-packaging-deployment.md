# 06 — Packaging and production loading

## `heft package-solution --production`

`PackageSolutionPlugin` → `SolutionPackager`:
- reads `config/package-solution.json` (solution id `67168930-…`, feature `e8292a31-…`, `includeClientSideAssets: true`, `skipFeatureDeployment: true`);
- manifests from `release/manifests/*.manifest.json`, assets from `release/assets/**` (only if production; otherwise warns and sets includeClientSideAssets=false and reads `dist/`);
- always adds `teams/*` icons;
- `normalizeSolutionDefinition`: when `includeClientSideAssets`, every manifest's `internalModuleBaseUrls` is set to the pseudo URL **`HTTPS://SPCLIENTSIDEASSETLIBRARY/`**;
- writes Open Packaging Convention XML (`sharepoint/solution/debug/`) and zips `sharepoint/solution/spfx-rea.sppkg`.

Package layout (from `sharepoint/solution/debug/`):

```
AppManifest.xml                      <App Name="spfx-rea-client-side-solution" ProductID=<solution id> IsClientSideSolution="true" SkipFeatureDeployment="true">
[Content_Types].xml, _rels/*.rels
feature_e8292a31-….xml (+ .config.xml, _rels)
e8292a31-…/WebPart_2997f152-….xml    <ClientSideComponent Id=… ComponentManifest="<entire manifest JSON, XML-escaped>"/>
ClientSideAssets.xml                 Feature "Client Side Assets" (Id dbbc577c-…)
ClientSideAssets/                    hello-world-web-part_<hash>.js, HelloWorldWebPartStrings_en-us_<md5>.js, *.png, LICENSE, teams icons
```

## Production URL resolution (observed on other solutions in this tenant)

`GET /_api/web/GetClientSideWebParts` for 3rd-party solutions returned e.g.
`internalModuleBaseUrls: ["https://mastaq.sharepoint.com/sites/appcatalog/ClientSideAssets/8cc5c58c-fdc6-4e3f-af19-42048e553dfc"]`, `entry: {type:"path", path:"faq-webpart_356bd3b3fe8ae29cd07c.js"}`.
So SharePoint replaces `HTTPS://SPCLIENTSIDEASSETLIBRARY/` with the app catalog's `ClientSideAssets/<solutionId>` folder when the app is deployed (public CDN is evidently not enabled in this tenant; with Office 365 CDN the URL would differ — **not verified**).

At runtime the deployed component goes through exactly the same RequireJS path as in 05; only `internalModuleBaseUrls[0]` differs, and the manifest comes from the server (`GetClientSideComponents` / preloaded) instead of `manifests.js`.

Not exercised: uploading `spfx-rea.sppkg` to the app catalog (would change tenant state). `deploy-azure-storage` (uploads `release/assets` to the container in `config/deploy-azure-storage.json`) and `dev-deploy` were not run.
