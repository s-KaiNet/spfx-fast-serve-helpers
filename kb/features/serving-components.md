---
title: Serving web parts, extensions and ACEs
type: feature
status: current
tags:
  - project-kb
  - web-parts
  - extensions
  - ace
  - serve-configurations
  - manifests
---

# Serving web parts, extensions and ACEs

## Summary

`fast-serve` serves every web part, extension (Application Customizer, ListView Command Set, Field Customizer, Form Customizer) and Adaptive Card Extension (ACE) found in the `config/config.json` bundles, including bundles that mix several components. Web parts and ACEs load with the plain debug query and are added from the toolbox; extensions load through `config/serve.json` `serveConfigurations`, selected with `--config`, and get the same extension query parameters `heft start` builds. Library components are not served.

## Behavior

### Components and bundles

- Every component of every `config/config.json` bundle is served; components with an unsupported `componentType` are skipped with a warning, and a component entry without `manifest`/`entrypoint` is skipped.
- A bundle with several components (for example two web parts and an Application Customizer) works: the debug manifests give each component its own `exportName`, and SharePoint picks the right class from the shared bundle.
- Each component's source manifest is served as is, with debug `loaderConfig`; `version: "*"` resolves to the `package.json` version.
- Relative icon paths with `./` or `../` (`preconfiguredEntries[].iconImageUrl` of web parts and ACEs, `items[].iconImageUrl` of command sets) become absolute dev server URLs (`https://localhost:4321/src/.../x.png`). Bare relative paths (`icons/x.png`) and absolute or `data:` URLs pass through, as in heft.
- In dev all bundles share one module graph, so a module imported by two bundles has one instance (production has one copy per bundle).

### Web parts

- Open the printed page and click **Load debug scripts**. The web part must already be on the page: add it from the toolbox while `fast-serve` runs, then save the page.
- Several web parts on one page, from the same or different bundles, work and hot-update independently.

### Extensions and serve configurations

`config/serve.json` `serveConfigurations.<name>` (the generator writes one per extension) may hold:

- `pageUrl`;
- `customActions` keyed by component id, `{ location, properties }`, for Application Customizers (`ClientSideExtension.ApplicationCustomizer`) and Command Sets (`ClientSideExtension.ListViewCommandSet`, `.CommandBar`, `.ContextMenu`);
- `fieldCustomizers` keyed by field internal name, `{ id, properties }`;
- `formCustomizer` with `componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties`.

`fast-serve` uses `default`, or the one picked with `--config <name>` / `--serve-config` / `"serveConfiguration"`, prints `serve configuration: <name>` and builds the query like heft:

- base: `debugManifestsFile=<origin>/temp/build/manifests.js&debug=true&noredir=true`;
- with any extension parameter: `loadSPFX=true` plus `customActions=<json>`, `fieldCustomizers=<json>` or the form parameters (`componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties=<json>`), and `debug=true` is **dropped**, because list pages fail to load debug scripts with both;
- the query replaces the page URL's own query; a `#hash` is kept.

For the `default` configuration the extension parameters are added to whatever page the [page order](cli-and-options.md#precedence) selects; a named configuration's own `pageUrl` wins over the `pageUrl` option. For identical input the printed query matches `heft start --serve-config <name>` byte for byte.

Warnings at start (the server still runs):

- an unknown `--config` name: lists the available names and falls back to `default`, like heft;
- a component id that isn't one of the served components, an extension used with the wrong kind or location (a Field Customizer as a command set), an unknown `customActions` location, a missing id;
- the generator's placeholders: field `InternalFieldName`, `RootFolder` `/sites/mySite/Lists/MyList`.

Malformed entries (for example `serveConfigurations` not an object, or an empty `location`) are fatal `config/serve.json: "…" must be …` errors naming the key.

### Adaptive Card Extensions

- Nothing ACE-specific to configure: ACEs use the plain debug query. Open a test page with the printed URL, edit it and add the card from the toolbox (listed under its `preconfiguredEntries` title).
- The SharePoint Online hosted workbench (`/_layouts/15/workbench.aspx`, still the generator's `initialPage`) works until its retirement on December 1, 2026; it keeps the unsaved canvas across reloads, which is convenient for trying a card. Microsoft's ACE tutorial now uses a SharePoint page.
- Card interaction (buttons, quick views) is disabled in edit mode: use **Preview** on the workbench, or save the page and leave edit mode.
- `@microsoft/sp-adaptive-card-extension-base` comes from the page like every SPFx library; quick view JSON templates (`import` or `require()`) and images are served by Vite; the lazily loaded property pane loads on demand.
- Every ACE edit reloads the page (see [HMR and Fast Refresh](hmr-and-fast-refresh.md)).

## Implementation Notes

- Extensions and ACEs reuse the web part path entirely: debug manifest, bundle shim, generated bundle entry and `exportName` handling are the same for all component types. Only the serve configuration handling (validation, warnings, query building) is extension-specific, in the configuration and server components.
- Serve configurations are read once at start; editing `config/serve.json` changes the printed URL only after a restart, although the page itself reloads on the change.
- The debug manifests and the bundle model are described in [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md) and [Startup and request flows](../architecture/runtime-flows.md).

## Edge Cases

- On list pages SharePoint loads every bundle of the debug manifest, including web part bundles.
- A localized command title in a manifest (`"title": { "id": "$…" }`) is not resolved, unlike heft; use `"default"` texts.
- `"icons/x.png"` without `./` resolves against the dev server root, as heft passes it through.
- Commands (`items`) and serve configuration `properties` are read when the page loads: edit, then reload (a manifest edit reloads by itself).
- On the test tenant, a Field Customizer's module loads but SharePoint never instantiates it, with `heft start` too; it is treated as a tenant/list-experience issue, so Fast Refresh of cell components is unverified live.
- The SharePoint Online workbench retires on 2026-12-01; after that, ACEs are tried on a SharePoint page (or a Viva Connections dashboard, not tried).

## Links

- [CLI, options and startup](cli-and-options.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [SPFx component types](../concepts/spfx-component-types.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Startup and request flows](../architecture/runtime-flows.md)
- [Match heft behavior for serve configurations and the debug URL](../decisions/match-heft-serve-behavior.md)

## Evidence

- Source: user docs, extensions and ACE research (heft 1.24.1 debug URL logic compared byte for byte), implementation behavior (configuration, server, manifests components); verified live on a SharePoint Online tenant during acceptance (web parts, mixed bundle, Application Customizer, Command Set, Form Customizer, ACE in the hosted workbench)
- Confidence: high
- Last checked: 2026-11-18
