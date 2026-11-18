---
title: SharePoint debug flow
type: concept
status: current
tags:
  - project-kb
  - spfx
  - sharepoint
  - debugging
---

# SharePoint debug flow

## Summary

SPFx components under development run inside a real SharePoint page that is opened with a debug query string pointing at a local `manifests.js`. SharePoint's loader then asks the user to allow debug scripts, loads the manifests from `https://localhost:<port>` and prefers them over deployed versions. Several browser gates (CSP, certificate trust, Local Network Access, sticky session state) decide whether this works; `fast-serve` relies on exactly the same flow as `heft start`.

## Current Knowledge

### Debug query

- Web parts and ACEs: `?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true`.
  - `debugManifestsFile`: URL of the debug `manifests.js`; sp-loader accepts one value and only a `localhost` URL.
  - `debug=true`: debug mode; `noredir=true`: no redirect away from the requested page.
- Extensions: `loadSPFX=true` plus `customActions=<json>` (Application Customizers, ListView Command Sets), `fieldCustomizers=<json>`, or form customizer parameters (`componentId`, `PageType`, `RootFolder`, `ID`, `ContentTypeID`, `properties=<json>`). `debug=true` is left out, because list pages fail to load debug scripts with both `debug` and `loadSPFX`.
- The debug parameters replace the page URL's own query; a `#hash` is kept. Both heft and `fast-serve` build the query from `config/serve.json` (`initialPage`, `serveConfigurations`); `{tenantDomain}` in page URLs comes from the `SPFX_SERVE_TENANT_DOMAIN` environment variable.
- Without a configured page the printed query can be appended to any SharePoint page. A web part must already be on the page (add it from the toolbox while the server runs, then save) — only the component id is stored in the page, never a version or URL.

### What the page does

1. The page loads sp-loader (inside `sp-pages-assembly`), which creates RequireJS.
2. With the debug query it shows the full-screen **"Allow debug scripts?"** prompt; the user clicks **Load debug scripts**.
3. It loads `manifests.js` as a script through RequireJS (an AMD module with `getManifests()`), drops manifests of components that are internal to the page (framework packages), and registers the rest as debug manifests, which win version resolution over deployed ones.
4. Components are then loaded as described in [Component manifests and the SharePoint loader](component-manifests-and-loader.md).
- A failure shows the dialog **"Error loading debug manifests."**

### Browser gates

| Gate | Symptom | Rule |
|---|---|---|
| CSP | script blocked (`blockedReason: csp`) | SharePoint adds `https://localhost:*` and `http://localhost:*` to `script-src` **only when the debug parameters are in the request**. Only `localhost` is listed, not `127.0.0.1`, so the dev server must be addressed as `localhost`. There is no `connect-src`/`style-src`/`img-src`, so WebSocket (HMR), fetch, CSS and images from localhost are not restricted. |
| Certificate | `ERR_CERT_AUTHORITY_INVALID`, "Error loading debug manifests" | The SPFx development certificate (Rushstack, CN `localhost`, stored in `~/.rushstack/`) must be trusted once per machine: `npx heft trust-dev-cert`, then restart the browser. `fast-serve` uses the same certificate as `heft start`; HTTPS is always on. |
| Local Network Access | request to `https://localhost` stays pending | Chrome/Edge (142+) ask whether the public page may reach local network devices; allow it. The dev server sends `Access-Control-Allow-Private-Network: true`. |
| Sticky debug mode | "Error loading debug manifests" after stopping the server | After allowing debug scripts, SharePoint stores the manifests URL in `sessionStorage["spfx-debug"]`. Opening the page without the query in the same tab still tries localhost and then fails on CSP. Use a new tab or clear that key. |

### Hosts

- Regular SharePoint pages (site pages, list views, list forms) are the main host.
- The SharePoint Online hosted workbench (`/_layouts/15/workbench.aspx`) still accepts the debug query and keeps an unsaved canvas across reloads, but it is deprecated and retired on 2026-12-01; Microsoft's ACE tutorial now uses a test page.
- Interaction with ACEs (buttons, quick views) is disabled in edit mode: use Preview on the workbench or a saved page in read mode.

## Links

- [SPFx development loop and what fast-serve replaces](spfx-dev-loop.md)
- [Component manifests and the SharePoint loader](component-manifests-and-loader.md)
- [SPFx component types](spfx-component-types.md)
- [Glossary](glossary.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)

## Evidence

- Source: research (live observation on a SharePoint Online tenant, shipped sp-loader and `@microsoft/spfx-heft-plugins` 1.24.1 code), project docs
- Confidence: high
- Last checked: 2026-11-18
