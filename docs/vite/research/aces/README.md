# Research: Adaptive Card Extensions (ACEs) in heft 1.24 and fast-serve

Date: 2026-11-17. Sources: `@microsoft/spfx-heft-plugins` 1.24.1 (`lib-commonjs/spfxManifests/webpack/ManifestPlugin.js`, `plugins/webpackConfigurationPlugin/SPFxDebugPageUrl*.js`), `@microsoft/generator-sharepoint` 1.24.1 output (Generic Card Template, `/tmp/n4-ace2/gen`), `@microsoft/sp-adaptive-card-extension-base` 1.24.1, Microsoft Learn ("Build your first SharePoint Adaptive Card Extension", updated 2026-10-28; "SharePoint Framework Debug Toolbar"), live checks on `mastaq.sharepoint.com/sites/dev`.

## Manifest

- `componentType: "AdaptiveCardExtension"`, `version: "*"` (→ `package.json`), `manifestVersion: 2`, `supportedHosts: ["Dashboard"]`, `preconfiguredEntries` like a web part plus `cardSize` (`Medium` / `Large`) and `properties` (`title`, `iconProperty`, ...). Schema `adaptive-card-extension-manifest.schema.json`.
- Heft: `ManifestPlugin._generateComponentManifest` has `case 'AdaptiveCardExtension': case 'WebPart':` → `_processWebpartManifest` ("Also used for AdaptiveCardExtension manifests"): `preconfiguredEntries` `title` / `description` / `group` / `tags` localized, `iconImageUrl` through `IconHandler` (relative `./x.png` copied to the CDN). `loaderConfig` is the same as for web parts (`entryModuleId` = bundle, `exportName` in multi-component bundles).
- Packaging (`normalizeSolutionDefinition`, `createComponentXml`) treats ACEs like web parts too (out of scope for a dev server).

## Serving and debug URL

- Heft's serve has nothing ACE-specific: `SPFxDebugPageUrl` / `SPFxDebugPageUrlUtilities` build the same `debugManifestsFile=…&debug=true&noredir=true` query; the generator's `serve.json` only has `initialPage: "https://{tenantDomain}/_layouts/workbench.aspx"` (no `serveConfigurations`).
- Where ACEs are tested in 2026: Microsoft's ACE tutorial now says to serve locally and add the ACE to a **test SharePoint page** from the toolbox, with `initialPage` set to that page, "not the SharePoint Online workbench". The Debug Toolbar page: the SharePoint Online workbench is deprecated since 2026-05-13 and **retired on 2026-12-01**. ACE interaction (quick view buttons) is disabled in edit mode (save the page / use read mode). Viva Connections dashboards are the other host; not tried here.
- The hosted workbench (`/sites/dev/_layouts/15/workbench.aspx` + debug query) still works today: the ACE is listed under "Local" by its `preconfiguredEntries` title, renders as a card, and the workbench keeps the **unsaved** canvas across reloads (nothing is saved unless you click Save). Card actions work in **Preview** mode.
- Conclusion: no ACE-specific debug URL or option in fast-serve; the README explains both routes.

## Code an ACE uses (generator 1.24.1, Generic Card Template)

- Files: `HelloAdaptiveCardExtension.ts` (class extending `BaseAdaptiveCardExtension`, registers views in `onInit`, `renderCard()` returns the card view id, `loadPropertyPaneResources()` does `import('./HelloPropertyPane')`), `cardView/CardView.ts` (`BaseComponentsCardView` + `BasicCardView({...})`), `quickView/QuickView.ts` (`BaseAdaptiveCardQuickView`, `template` getter returns `import template from './template/QuickViewTemplate.json'`), `assets/MicrosoftLogo.png` (used by the Image card view template: `import microsoftLogo from '../assets/MicrosoftLogo.png'`), `loc/en-us.js` + `mystring.d.ts`.
- Older templates / samples use `require('./template/QuickViewTemplate.json')`.
- Dependencies: `@microsoft/sp-adaptive-card-extension-base` (an SPFx library: `dist/eeec822e-….manifest.json`, `componentType: "Library"`), `@microsoft/sp-property-pane`, `@microsoft/sp-core-library`. No React.
- At runtime SharePoint loads `sp-adaptive-card-extension-web-part`, `-base`, `-renderer`, `-components` from its CDN; the Adaptive Card templating/rendering happens there, the ACE only returns data and template JSON.

## fast-serve implementation

- `project/project.ts`: `AdaptiveCardExtension` added to the supported component types → manifests, bundle shim, entry, `exportName`, relative `preconfiguredEntries` icons (`manifests/iconUrls.ts`) all reuse the web part path. Start log lists `Adaptive Card Extensions: <alias>`.
- `@microsoft/sp-adaptive-card-extension-base` is found by the existing SPFx library scan and gets a TLA facade (tenant version: `eeec822e-…_1.25.0` defined in RequireJS while the project has 1.24.1).
- JSON templates: Vite's JSON plugin (`import`) / the existing `require()` → import transform (`require('./x.json')` → default import). Images: Vite assets, absolute dev server URLs via `server.origin`; typings from `temp/static-asset-ts`.
- HMR: views are classes registered in `onInit` and only imported by the ACE class, and there is no React tree, so edits to the ACE class, card/quick views, JSON templates and loc strings bubble to the bundle entry → page reload. Nothing ACE-specific was added for HMR.

## Live results (spfx-rea, 2026-11-17)

Setup: the generator's Generic Card ACE (`src/adaptiveCardExtensions/hello`, own bundle `hello-adaptive-card-extension`), with the card bar `icon` set to the imported `MicrosoftLogo.png`; `@microsoft/sp-adaptive-card-extension-base@1.24.1` installed. Page: hosted workbench `https://mastaq.sharepoint.com/sites/dev/_layouts/15/workbench.aspx?debugManifestsFile=…&debug=true&noredir=true`, nothing saved.

| Check | Result |
|---|---|
| ACE in the toolbox, added to the canvas | card renders: title "Hello", icon from `https://localhost:4321/src/adaptiveCardExtensions/hello/assets/MicrosoftLogo.png`, text, "Quick view" button |
| Quick view (Preview mode) | opens, template JSON bound to `data` ("Adaptive Card Extension" / "Quick view") |
| `require('./template/QuickViewTemplate.json')` instead of the import | quick view renders |
| Card view edit (`text`) | page reload (marker gone), card shows the new text; the workbench restored the unsaved card |
| Quick view template JSON edit | page reload, quick view shows the edited text |
| Property pane (edit mode, "Edit web part") | `HelloPropertyPane.ts` loaded on demand, "Card title" field shown |
| Syntax error in `CardView.ts` | the card's error box shows `[fast-serve] Failed to load bundle "hello-adaptive-card-extension" … [PARSE_ERROR] … CardView.ts:54:23`; fixing the file reloads the page |

Seen, not ACE-specific: Fluent UI warns `The icon "https://localhost:4321/src/adaptivecardextensions/hello/assets/microsoftlogo.png" was used but not registered` (SharePoint's card bar first treats the icon URL as an icon name; the image itself loads). Vite's own error overlay appeared over the page on the syntax error (fast-serve doesn't disable `server.hmr.overlay`, although the README says there's no overlay).

Not checked: a Viva Connections dashboard, an ACE on a regular SharePoint page (needs a page edit), `heft start` side by side.
