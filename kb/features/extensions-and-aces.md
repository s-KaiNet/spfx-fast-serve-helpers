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

Extensions are served exactly like heft serves them: `--config <name>` (alias `--serve-config`, or `"serveConfiguration"` in `fast-serve/config.json`) picks a `config/serve.json` serve configuration, whose page and extension parameters become the printed `open:` URL. Startup warnings point out configurations that cannot work (unknown component ids, wrong extension kind, unknown locations, the generator's placeholders). ACEs need nothing special in the Rspack build: they are components like web parts, their quick-view templates, images and lazy property-pane chunks go through the normal compile, and the libraries of lazy chunks are declared on the bundle's `define`. The ready banner adds an ACE hint and, next to a regular page, the site's hosted workbench URL with the plain debug query.

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

Banner: when the project has ACEs, one line explains where to add them (toolbox in edit mode; card actions and quick views only in preview/read mode). If the page is a regular page, a second line prints the hosted workbench of the page's site (`<site>/_layouts/15/workbench.aspx`, site = the path before `SitePages`, `Pages`, `Lists`, `_layouts`, `Shared Documents` or `Forms`, else `/sites|teams/<name>`, else the root) with the plain web-part debug query, and the retirement date 2026-12-01. No line for a workbench page or without a page.

### Hosted workbench quirks

- The workbench loads `debugManifestsFile` and additionally probes the classic default `localhost:4321` (`/temp/manifests.js`, `/temp/build/manifests.js`, http and https). When nothing answers there (fast-serve on another port), it shows a "Your web part will not appear in the toolbox" warning on every load. Dismiss it: the components from the debug manifests are in the toolbox anyway.
- The unsaved canvas survives reloads, so an ACE edit reloads the page and the card reappears with the change.

### Live results (spfx-rea copy, SPFx 1.24.1 project on a 1.25 tenant, port 4431)

| Check | Result |
|---|---|
| `--config banner` | Application Customizer renders on the page together with the web parts |
| Banner component text edit | hot update, React state kept (counter "Clicked 2" survived), save → DOM ≈0.3 s, rebuild 43 ms |
| `--config commands` | list view with the printed URL; the Command Set loads, "Command Two" appears in the command bar (overflow menu in the narrow headless window), its dialog opens; command icon served |
| Command Set class edit | page reload, dialog shows the new text |
| `--config feedback_EditForm` | Form Customizer renders on `SPListForm.aspx`; a component edit hot-updates without reload |
| ACE on the hosted workbench (printed URL) | listed in the toolbox as "Hello", card renders with the bundled logo; property pane loads `chunk.Hello-property-pane.js` and shows "Card title"; Preview → Quick view opens with the template |
| ACE card view edit | page reload, the restored card shows the new text |
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

- Source: implementation behavior (serve-configuration warnings and debug query ported from the Vite implementation, which matches heft); integration test with a real dev server on a fixture with an ACE (JSON template, image, lazy chunk), an Application Customizer and a Command Set; live checks in headless Chrome on SharePoint Online
- Confidence: high
- Last checked: 2026-11-19
