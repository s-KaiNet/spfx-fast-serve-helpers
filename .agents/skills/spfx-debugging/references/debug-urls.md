# Debug URLs

## Web parts

```
<page without query>?debugManifestsFile=https%3A%2F%2Flocalhost%3A<port>%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true[#hash]
```

- The debug parameters **replace** the page's own query; a `#hash` is kept. `scripts/debug-url.sh <page> [port]` builds it.
- SharePoint fetches `manifests.js` (an AMD module with `getManifests()`), registers those manifests and loads the components that are on the page. A web part that isn't on the page doesn't appear: adding it means editing the page, which needs the user's permission.
- fast-serve prints the query (unencoded, also valid) in a box at start: the line after `To load your scripts, append this to your SharePoint page URL:`. Get it with `grep -m1 -o '?debugManifestsFile=[^ ]*' <server log>` and append it to the page without its query. heft prints its own box (encoded) and may open the page.

## Extensions

Extensions use `loadSPFX=true` plus the component parameters, from `config/serve.json` `serveConfigurations`, and **no `debug=true`** (list pages fail to load debug scripts with both):

- Application Customizer / ListView Command Set: `&loadSPFX=true&customActions={"<id>":{"location":"ClientSideExtension.ApplicationCustomizer","properties":{…}}}` (Command Set locations: `ClientSideExtension.ListViewCommandSet`, `.CommandBar`, `.ContextMenu`);
- Field Customizer: `&loadSPFX=true&fieldCustomizers={"<InternalFieldName>":{"id":"<id>","properties":{…}}}`;
- Form Customizer: `_layouts/15/SPListForm.aspx?…&loadSPFX=true&componentId=<id>&PageType=8|6|4&RootFolder=/sites/x/Lists/Y&ID=<item>&properties={…}` (8 new, 6 edit, 4 view).

Values may be URL-encoded (heft) or unencoded except whitespace, `%`, `&`, `#`, `+` (fast-serve). Easiest: start `fast-serve --config <name>` and copy the second query from the box (the line after `To load the extensions of serve configuration "<name>" too, use this instead:`; `grep -o '?debugManifestsFile=[^ ]*loadSPFX=true[^ ]*' <server log>`), then append it to the configuration's page; or `heft start --serve-config <name>` and use the URL it prints. Without `--config`, fast-serve prints only the web-part query. The serve configuration is read at start: restart after editing `serve.json`. Use `SPFX_DEBUG_LIST_URL` when a configuration has no usable `pageUrl`.

## Adaptive Card Extensions

Microsoft's flow ([Build your first ACE](https://learn.microsoft.com/en-us/sharepoint/dev/spfx/viva/get-started/build-first-sharepoint-adaptive-card-extension)): a test SharePoint page with the web-part debug query, edit mode → toolbox → the ACE's manifest title, then save the page and use read mode for card actions and quick views.

- Same query as web parts (the first query in fast-serve's box).
- Edit mode autosaves a draft and interaction needs a saved page: both need the user's explicit permission on a page they name. The card view, property pane and lazy chunks can be checked in edit mode; card actions and quick views only in read mode.
- An ACE already on a saved page (or a Viva Connections dashboard) only needs the debug query: it renders from the dev server in read mode.
- Without permission, check that the module loads by id (see checks) and report that rendering wasn't verified.

## The "Allow debug scripts?" dialog

Shown on the first debug load of a tab. Take `ab snapshot -i`, find the button `Load debug scripts`, `ab click @eN`, then wait a few seconds for the components. Answer is stored in `sessionStorage["spfx-debug"]` for the tab, so later loads in the same tab skip it (and keep debug mode on, see pitfalls).
