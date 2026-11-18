---
title: Glossary
type: concept
status: current
tags:
  - project-kb
  - glossary
---

# Glossary

## Summary

Short definitions of SPFx, SharePoint, Vite and project terms used across the KB, with a pointer to the concept page that explains each in context.

## Current Knowledge

| Term | Meaning | More |
|---|---|---|
| ACE | Adaptive Card Extension: a card for Viva Connections dashboards and SharePoint pages, rendered by SharePoint from data and Adaptive Card JSON | [component types](spfx-component-types.md) |
| Allow debug scripts? | SharePoint's prompt before it loads debug manifests; answered with **Load debug scripts** | [debug flow](sharepoint-debug-flow.md) |
| Bundle | a `config/config.json` entry grouping one or more components; one AMD script in production | [manifests and loader](component-manifests-and-loader.md) |
| Bundle shim | the classic AMD script `fast-serve` serves per bundle; it satisfies RequireJS and hands over to the ES module entry | [dev loop](spfx-dev-loop.md) |
| Debug manifests | manifests registered from `debugManifestsFile`; they win version resolution over deployed components | [debug flow](sharepoint-debug-flow.md) |
| Debug query | `debugManifestsFile=…&debug=true&noredir=true` (web parts, ACEs) or `loadSPFX=true` plus extension parameters | [debug flow](sharepoint-debug-flow.md) |
| Dev certificate | the Rushstack/SPFx localhost certificate in `~/.rushstack/`, trusted with `npx heft trust-dev-cert` | [debug flow](sharepoint-debug-flow.md) |
| `exportName` | `loaderConfig` field naming the module property holding a component's class in a multi-component bundle | [manifests and loader](component-manifests-and-loader.md) |
| Extension | Application Customizer, ListView Command Set, Field Customizer or Form Customizer | [component types](spfx-component-types.md) |
| Externals | imports that are never bundled and are resolved by the page (`sp-*`, React, loc strings, `config.json` `externals`) | [manifests and loader](component-manifests-and-loader.md) |
| Facade | the module `fast-serve` serves in place of an SPFx library import; it obtains the page's instance via `loadComponentById` | [manifests and loader](component-manifests-and-loader.md) |
| Fast Refresh | React's hot update mechanism that keeps component state | [HMR](hmr-and-vite-terms.md) |
| Full reload | reloading the SharePoint page when no module accepts an update | [HMR](hmr-and-vite-terms.md) |
| Heft | the Rushstack build orchestrator used by SPFx 1.22+ (`heft build`, `heft start`, `heft package-solution`) | [dev loop](spfx-dev-loop.md) |
| HMR boundary | a module that accepts its own hot updates; updates bubble up to the nearest one | [HMR](hmr-and-vite-terms.md) |
| Hosted workbench | `/_layouts/15/workbench.aspx`, SharePoint Online's test canvas, retired on 2026-12-01 | [debug flow](sharepoint-debug-flow.md) |
| Library component | an SPFx component of type `Library` shared by other components; not served by `fast-serve` yet | [component types](spfx-component-types.md) |
| LNA | Local Network Access: Chrome/Edge permission for public pages to reach `localhost` | [debug flow](sharepoint-debug-flow.md) |
| `loadComponentById` | `SPComponentLoader` API that loads an SPFx component by id and minimum version | [manifests and loader](component-manifests-and-loader.md) |
| Localized resources | per-locale string modules (`*Strings`) declared in `config.json` `localizedResources` | [styles, localization, assets](styles-localization-assets.md) |
| `manifests.js` | `/temp/build/manifests.js`, the AMD module returning debug manifests via `getManifests()` | [manifests and loader](component-manifests-and-loader.md) |
| Module id | `<componentId>_<version>`, the RequireJS name of a component's entry module | [manifests and loader](component-manifests-and-loader.md) |
| Overlay | Vite's in-page error panel; toggled by the `overlay` option | [HMR](hmr-and-vite-terms.md) |
| Pre-bundling (optimizer) | Vite bundling `node_modules` dependencies into ES modules at start | [HMR](hmr-and-vite-terms.md) |
| Rig | `@microsoft/spfx-web-build-rig`, the shared Heft/TypeScript/Sass configuration of SPFx projects | [dev loop](spfx-dev-loop.md) |
| `scriptResources` | manifest map from bare specifier to `path`, `localizedPath` or `component` resource | [manifests and loader](component-manifests-and-loader.md) |
| Serve configuration | a `config/serve.json` `serveConfigurations` entry: page URL plus extension parameters | [component types](spfx-component-types.md) |
| sp-loader | SharePoint's module loader (`@microsoft/sp-loader`), built on RequireJS 2.3.7 | [manifests and loader](component-manifests-and-loader.md) |
| `spfx-debug` | the `sessionStorage` key that makes debug mode sticky for a tab | [debug flow](sharepoint-debug-flow.md) |
| SPFx library | any package shipping an SPFx library manifest (`@microsoft/sp-*`, ACE base, built library components) | [manifests and loader](component-manifests-and-loader.md) |
| Theme token | `"[theme:name, default:value]"` in CSS, resolved from the page theme by `loadStyles` | [styles, localization, assets](styles-localization-assets.md) |
| Warmup | transforming the entry import graph before the browser asks for it | [HMR](hmr-and-vite-terms.md) |

## Links

- [SPFx development loop and what fast-serve replaces](spfx-dev-loop.md)
- [SharePoint debug flow](sharepoint-debug-flow.md)
- [Component manifests and the SharePoint loader](component-manifests-and-loader.md)
- [SPFx component types](spfx-component-types.md)
- [Styles, localization and assets in SPFx](styles-localization-assets.md)
- [HMR, Fast Refresh and Vite terms](hmr-and-vite-terms.md)
