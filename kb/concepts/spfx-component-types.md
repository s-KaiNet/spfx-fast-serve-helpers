---
title: SPFx component types
type: concept
status: current
tags:
  - project-kb
  - spfx
  - web-parts
  - extensions
  - ace
  - library-components
---

# SPFx component types

## Summary

An SPFx project can contain web parts, extensions (four kinds that matter here), Adaptive Card Extensions (ACEs) and library components. All share the same bundle and manifest machinery (heft's manifest step builds and lists every component the same way and only post-processes some fields per type), but they differ in how SharePoint hosts them and how they are put on a page during development. The Rspack `fast-serve` serves all of them; `Application` (old) and `Prefab` (internal) components are skipped with a warning.

## Current Knowledge

| Type | Manifest | Host / how it gets on the page in dev | Target of the Rspack `fast-serve` |
|---|---|---|---|
| Web part | `componentType: "WebPart"` | added to a page from the toolbox; the page stores only its id and properties | yes |
| Application Customizer | `componentType: "Extension"`, `extensionType: "ApplicationCustomizer"` | `customActions` with location `ClientSideExtension.ApplicationCustomizer`; renders into page placeholders (`Top`, `Bottom`) | yes |
| ListView Command Set | `extensionType: "ListViewCommandSet"` | `customActions` with a `ClientSideExtension.ListViewCommandSet[.CommandBar|.ContextMenu]` location on a list view; commands come from the manifest `items` | yes |
| Field Customizer | `extensionType: "FieldCustomizer"` | `fieldCustomizers` keyed by field internal name on a list view; `onRenderCell` renders each cell | yes |
| Form Customizer | `extensionType: "FormCustomizer"` | `formCustomizer` parameters on `_layouts/15/SPListForm.aspx` (`PageType` new/edit/view) | yes |
| Adaptive Card Extension | `componentType: "AdaptiveCardExtension"`, `supportedHosts: ["Dashboard"]`, `cardSize` | added from the toolbox of a test page like a web part; interaction only in read mode on a saved page | yes |
| Library component | `componentType: "Library"` | consumed by other SPFx components as a `component` script resource; deployed tenant-wide | yes, served from its own project; and as linked source compiled into a consumer ([local library projects](../features/local-library-projects.md)) |

Every extension type (also `SearchQueryModifier`) is built as an `Extension` bundle; `Application` and `Prefab` components are skipped with a warning. The 1.23 generator creates web parts, extensions, ACEs and libraries, not `Application` or `Prefab`. Copilot components (`CopilotComponent`) arrived in SPFx 1.24: heft 1.23 doesn't know them, and `fast-serve` 1.23 skips them with the same warning as other unsupported types.

### Serve configurations

- `config/serve.json` `serveConfigurations.<name>` describes one way of opening a page: `pageUrl` plus `customActions` (keyed by component id: `location`, `properties`), `fieldCustomizers` (keyed by field internal name: `id`, `properties`) or `formCustomizer` (`componentId`, `PageType`, `RootFolder`, `ContentTypeID`, `ID`, `properties`). The schema requires a `default` entry. The SPFx generator writes one configuration per extension.
- A configuration turns into the extension debug query (`loadSPFX=true`, …) described in [SharePoint debug flow](sharepoint-debug-flow.md). heft picks one with `--serve-config <name>`; `fast-serve` accepts `--config` and `--serve-config`.

### Type-specific traits that matter for development

- **Web parts and extensions** usually render React; the component class itself is created by SharePoint, so class edits cannot be swapped in place.
- **ACEs** have no React tree: SharePoint renders card and quick views from data and Adaptive Card template JSON the ACE returns; the views are classes registered in `onInit`. The rendering libraries (`sp-adaptive-card-extension-*`) come from the tenant.
- **Command Sets** have no own UI apart from dialogs (`@microsoft/sp-dialog`); commands are read from the manifest when the page loads.
- **Mixed bundles**: one bundle may hold several components of different types (e.g. two web parts and an Application Customizer); each gets an `exportName`.
- **Library components** are separate SPFx components with their own version; consumers resolve them through the manifest store like `sp-*` packages, and in production updating the library updates all consumers.

## Links

- [Component manifests and the SharePoint loader](component-manifests-and-loader.md)
- [SharePoint debug flow](sharepoint-debug-flow.md)
- [Roadmap overview](../roadmap/overview.md)
- [Extensions and Adaptive Card Extensions](../features/extensions-and-aces.md)

## Evidence

- Source: research (SPFx generator 1.24 output, `@microsoft/spfx-heft-plugins` 1.24.1 manifest and serve code, live checks), project docs
- Confidence: high
- Last checked: 2026-11-23 (Copilot components, library projects and the generator's component types checked against `@microsoft/generator-sharepoint` and `@microsoft/spfx-heft-plugins` 1.24.2)
