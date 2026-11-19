# Research: SPFx extensions in heft 1.24 and fast-serve

Date: 2026-11-17. Sources: `@microsoft/spfx-heft-plugins` 1.24.1 (`lib-commonjs/plugins/webpackConfigurationPlugin/SPFxDebugPageUrl.js`, `SPFxDebugPageUrlUtilities.js`, `spfxConfig/schemas/spfx-serve.schema.json`, `spfxManifests/webpack/ManifestPlugin.js`, `IconHandler.js`), `@microsoft/generator-sharepoint` 1.24.0-rc.0 output (a throwaway project with one extension of each type), `heft start --serve-config rating` and `heft build` on `spfx-rea`, live checks on `mastaq.sharepoint.com/sites/dev`.

## Manifests

- `componentType: "Extension"` plus `extensionType`: `ApplicationCustomizer`, `ListViewCommandSet`, `FieldCustomizer`, `FormCustomizer` (also `SearchQueryModifier`, `Unknown`). `version: "*"` → `package.json` version, as for web parts.
- Heft's manifest processing for extensions (`_processExtensionsManifest`) only touches `ListViewCommandSet` `items`: `title` / `ariaLabel` localized (`{ "id": "$file:name;" }` form), `iconImageUrl` through `IconHandler` (`./x.png` / `../x.png` → copied to the CDN as `x_<hash>.png`; `https://`, `data:` and bare relative URLs like `icons/x.png` pass through with a warning for the last). Everything else is passed through; `loaderConfig` is the same shape as for web parts (`entryModuleId` = bundle, `exportName` in multi-component bundles, `scriptResources`).
- The generator creates one bundle per extension and adds `loc/` strings per extension. Field and Form Customizer templates use React (`createRoot`), Application Customizer and Command Set don't (Command Set uses `@microsoft/sp-dialog`). The command set manifest references `icons/request.png` / `icons/cancel.png`, files the generator doesn't create (heft warns).
- Dependencies the templates add: `@microsoft/sp-application-base`, `@microsoft/sp-listview-extensibility`, `@microsoft/sp-dialog` (all SPFx libraries → regular fast-serve facades).

## Serve configurations and debug query

`config/serve.json` `serveConfigurations.<name>`: `pageUrl` (required by the schema, and the schema requires a `default` entry), `customActions` (keyed by component id: `{ location, properties }`, locations `ClientSideExtension.ApplicationCustomizer`, `.ListViewCommandSet`, `.ListViewCommandSet.CommandBar`, `.ListViewCommandSet.ContextMenu`, `.SearchQueryModifier`), `fieldCustomizers` (keyed by field internal name: `{ id, properties }`), `formCustomizer` (`componentId`, `PageType`, `RootFolder`, `ContentTypeID`, `ID`, `properties`).

Heft (`SPFxDebugPageUrlUtilities.getServeInitialPageFromConfiguration` + `buildQueryParameters`):

- configuration = `--serve-config <name>`, else `default` when `serveConfigurations` exists; an unknown name warns and falls back to `default`;
- page = selected `pageUrl` → `default.pageUrl` → `initialPage`; `{tenantDomain}` (case-insensitive) from `SPFX_SERVE_TENANT_DOMAIN`;
- query = `debugManifestsFile=<origin>/temp/build/manifests.js&debug=true&noredir=true`; with any extension parameter also `loadSPFX=true`, `customActions=JSON`, `fieldCustomizers=JSON`, form customizer keys as is (`properties` JSON, `RootFolder` `decodeURIComponent`ed, falsy values skipped), and `debug` **removed** ("the lists app fails to load debug scripts on initial page load with both debug and loadSPFX");
- heft replaces the page URL's own query (`url.search = params`), built with `URLSearchParams` (spaces as `+`).

`heft start --serve-config rating` printed exactly the query fast-serve builds for the same configuration (compared byte for byte).

## fast-serve implementation

- `project/serveConfigurations.ts` reads and validates the entries (`config/serve.json: "serveConfigurations.x.customActions.<id>.location" must be …`).
- `config/options.ts`: `--config` / `--serve-config` / `"serveConfiguration"` in `fast-serve/config.json`; default `default`; an unknown name warns with the list of names and falls back to `default`, like heft (user decision 2026-11-17, "match heft"). Page precedence (heft's chain with the `pageUrl` option in place of its fallbacks): named configuration `pageUrl` (not `default`) > `--page-url` > `fast-serve.json` `pageUrl` > `default.pageUrl` > `initialPage`.
- `server/debugUrl.ts` builds the query like heft and replaces the page URL's own query (the hash is kept), like heft's `url.search = params`.
- `server/serveConfigurationWarnings.ts`: unknown component ids, extension type vs location/kind mismatches, unknown locations, generator placeholders (`InternalFieldName`, `/sites/mySite/Lists/MyList`).
- Manifests/loader/entry: extensions use the same bundle shim, entry and `exportName` machinery as web parts; mixed bundles work. Relative `./` icon paths in command set `items` and web part `preconfiguredEntries` become absolute dev server URLs (`https://localhost:4321/src/.../x.png`). Localized `{ "id": "$…" }` titles are not resolved (not done for web parts either).

## Live results (spfx-rea, 2026-11-17)

Test setup: Application Customizer added to the existing `hello-world-web-part` bundle (mixed bundle: 2 web parts + 1 extension), Command Set, Field Customizer and Form Customizer in their own bundles (generator code; the Application Customizer renders a React banner into the `Top` placeholder instead of the template's `Dialog.alert`). Lists: existing `Categories` (`/sites/dev/Lists/WMFAQ_Categories`) and `Phone Sales History`; nothing saved or installed.

| Extension | Result |
|---|---|
| Application Customizer on `SitePages/spfx-rea.aspx` (`customActions`) | renders in `Top` next to the web parts; component edit → hot update with state kept; SCSS edit → hot swap, theme tokens resolved; class edit → page reload |
| ListView Command Set on `Categories` (`customActions` `.CommandBar`) | "Command Two" in the command bar (overflow), shows the dialog; class edit → page reload with the new text |
| Form Customizer, `SPListForm.aspx` `PageType=4` (`formCustomizer`) | renders; component edit → hot update without reload |
| Field Customizer (`fieldCustomizers`, `Title` / `Brand` / `WMFAQ_Order`, two lists, list and grid views) | **not instantiated by SharePoint**: the module is loaded (`21fe7eba…_0.0.1` defined in RequireJS) but `onInit` never runs, no cell is rendered. Same with `heft start --serve-config rating` and the same query, and with `&debug=true` added, in a fresh tab. Looks like a tenant/list-experience issue, not fast-serve. Fast Refresh of the cell component could not be checked live |

Observation (fast-serve, not compared with heft): on list pages SharePoint loaded every bundle of the debug manifest (all four entries, including the web part bundle).
