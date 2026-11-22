---
title: Extensions and Adaptive Card Extensions
type: feature
status: current
tags:
  - project-kb
  - extensions
  - ace
  - serve-configurations
  - dev-server
---

# Extensions and Adaptive Card Extensions

## Summary

Extensions are served exactly like heft serves them: `--config <name>` (alias `--serve-config`, or `"serveConfiguration"` in `fast-serve/config.json`) picks a `config/serve.json` serve configuration, whose extension parameters become a second debug query in the startup box when the configuration is selected explicitly. Startup warnings point out configurations that cannot work (unknown component ids, wrong extension kind, unknown locations, the generator's placeholders). ACEs need nothing special in the Rspack build: they are components like web parts, their quick-view templates, images and lazy property-pane chunks go through the normal compile, and the libraries of lazy chunks are declared on the bundle's `define`. ACEs load with the web-part debug query the box always prints first.

## Behavior

### Serve configurations

- Selection: the named configuration, else `default`; an unknown name warns (listing the available ones) and falls back to `default`. Page order and the query rules are in [CLI, options and startup](cli-and-options.md) and [Dev server](dev-server.md#debug-url-and-ready-banner): a configuration with `customActions`, `fieldCustomizers` or `formCustomizer` produces heft's extension query (`loadSPFX=true`, the JSON parameters, form customizer parameters, no `debug=true`); the page's own query is replaced and its `#hash` kept.
- Warnings, printed once at start for the selected configuration (ids compared case-insensitively):
  - a `customActions` key or `fieldCustomizers.<field>.id` / `formCustomizer.componentId` that is not a served component;
  - a component of the wrong kind for its slot (custom action location → Application Customizer, ListView Command Set or Search Query Modifier; field customizer → Field Customizer; form customizer → Form Customizer);
  - an unknown custom action location;
  - the generator's placeholders: field `InternalFieldName`, `RootFolder` `/sites/mySite/Lists/MyList`.
- A `serve.json` change [restarts](project-restarts.md) fast-serve, which prints the new URL.

### Adaptive Card Extensions

| Aspect | Behavior |
|---|---|
| Manifest | rendered like a web part manifest: `version: "*"` from `package.json`, `loaderConfig` with the bundle, `exportName` in multi-component bundles, relative `preconfiguredEntries` icons served from the source file and made absolute |
| Libraries | `@microsoft/sp-adaptive-card-extension-base` is an ordinary SPFx library external; the tenant's version is used at runtime |
| Quick-view templates | JSON imports (or `require`) are bundled as data |
| Images | `asset/resource`, absolute URLs on the dev server (e.g. the card bar icon) |
| Lazy chunks | `import()` (the generator's property pane) becomes `chunk.<name>.js` loaded from the dev server's `/dist/`; its libraries (`@microsoft/sp-property-pane`) are hoisted onto the entry `define` and listed in the manifest's `scriptResources`, so no heft-style async-component loader is needed |
| Edits | card views, quick views, templates, loc strings and the ACE class only reach the bundle entry → page reload |

Banner: nothing ACE-specific; the web-part debug query in the box is the one ACEs need. How to add and use them on a page (toolbox in edit mode; card actions and quick views in read mode, on a saved page) is in the user docs.

Testing flow (Microsoft's ACE tutorials since the online workbench's deprecation): serve, open a test SharePoint page with the web-part debug query, edit the page and add the ACE from the toolbox; card actions and quick views are disabled in edit mode, so the page is saved and the card used in read mode. An ACE already on a saved page or dashboard renders from the dev server with just the debug query.

### Live results (spfx-rea copy, SPFx 1.24.1 project on a 1.25 tenant, port 4431)

| Check | Result |
|---|---|
| `--config banner` | Application Customizer renders on the page together with the web parts |
| Banner component text edit | hot update, React state kept (counter "Clicked 2" survived), save → DOM ≈0.3 s, rebuild 43 ms |
| `--config commands` | list view with the printed URL; the Command Set loads, "Command Two" appears in the command bar (overflow menu in the narrow headless window), its dialog opens; command icon served |
| Command Set class edit | page reload, dialog shows the new text |
| `--config feedback_EditForm` | Form Customizer renders on `SPListForm.aspx`; a component edit hot-updates without reload |
| ACE added from the toolbox to an unsaved canvas (`1.24.0-rspack.5`; the page-based flow needs a saved page and was not rechecked) | listed in the toolbox as "Hello", card renders with the bundled logo; property pane loads `chunk.Hello-property-pane.js` and shows "Card title"; quick view opens with the template in preview |
| ACE card view edit | page reload, the card shows the new text |
| Field Customizer | not checked: SharePoint does not instantiate it on this tenant, also under `heft start` |

## Links

- [Restarts on project changes](project-restarts.md)
- [SPFx component types](../concepts/spfx-component-types.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [CLI, options and startup](cli-and-options.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [HMR and React Fast Refresh](hmr.md)
- [Rspack compile](rspack-compile.md)

## Evidence

- Source: implementation behavior (serve-configuration warnings and debug query ported from the Vite implementation, which matches heft); integration test with a real dev server on a fixture with an ACE (JSON template, image, lazy chunk), an Application Customizer and a Command Set; live checks in headless Chrome on SharePoint Online; ACE testing flow from Microsoft Learn ("Build your first SharePoint Adaptive Card Extension", "SharePoint Framework Debug Toolbar")
- Confidence: high
- Last checked: 2026-11-20
