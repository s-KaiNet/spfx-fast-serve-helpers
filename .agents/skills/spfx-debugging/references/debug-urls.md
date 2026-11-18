# Debug URLs

## Web parts

```
<page without query>?debugManifestsFile=https%3A%2F%2Flocalhost%3A<port>%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true[#hash]
```

- The debug parameters **replace** the page's own query; a `#hash` is kept. `scripts/debug-url.sh <page> [port]` builds it.
- SharePoint fetches `manifests.js` (an AMD module with `getManifests()`), registers those manifests and loads the components that are on the page. A web part that isn't on the page doesn't appear: adding it means editing the page, which needs the user's permission (or use the workbench).
- fast-serve prints the same URL at start (`[fast-serve] open: …`) for its configured page; heft prints/opens it too. Prefer the printed URL when it exists.

## Extensions

Extensions use `loadSPFX=true` plus the component parameters, from `config/serve.json` `serveConfigurations`, and **no `debug=true`** (list pages fail to load debug scripts with both):

- Application Customizer / ListView Command Set: `&loadSPFX=true&customActions={"<id>":{"location":"ClientSideExtension.ApplicationCustomizer","properties":{…}}}` (Command Set locations: `ClientSideExtension.ListViewCommandSet`, `.CommandBar`, `.ContextMenu`);
- Field Customizer: `&loadSPFX=true&fieldCustomizers={"<InternalFieldName>":{"id":"<id>","properties":{…}}}`;
- Form Customizer: `_layouts/15/SPListForm.aspx?…&loadSPFX=true&componentId=<id>&PageType=8|6|4&RootFolder=/sites/x/Lists/Y&ID=<item>&properties={…}` (8 new, 6 edit, 4 view).

All values URL-encoded. Easiest: start `fast-serve --config <name>` (or `heft start --serve-config <name>`) and copy the printed `open:` URL. The serve configuration is read at start: restart after editing `serve.json`. Use `SPFX_DEBUG_LIST_URL` when a configuration has no usable `pageUrl`.

## Adaptive Card Extensions

- Same query as web parts. On a page the ACE must be added from the toolbox in edit mode (needs permission).
- Hosted workbench (`SPFX_DEBUG_WORKBENCH_URL` + debug query): edit mode → **+** → toolbox section **Dashboard** / the ACE's manifest title. Nothing is saved unless you click Save; the workbench keeps the unsaved canvas in browser storage across reloads (and across sites of the same tenant).
- Card actions and quick views are disabled in edit mode: switch the workbench to **Preview**.
- Microsoft retires the SharePoint Online workbench on 2026-12-01; after that use a test page the user lets you edit.

## The "Allow debug scripts?" dialog

Shown on the first debug load of a tab. Take `ab snapshot -i`, find the button `Load debug scripts`, `ab click @eN`, then wait a few seconds for the components. Answer is stored in `sessionStorage["spfx-debug"]` for the tab, so later loads in the same tab skip it (and keep debug mode on, see pitfalls).
