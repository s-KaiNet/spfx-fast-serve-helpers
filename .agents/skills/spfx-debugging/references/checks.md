# Checks, loading by id, HMR test

`ab` is the shell function from SKILL.md: `ab() { agent-browser --session spfx-debug --cdp "${SPFX_DEBUG_CDP_PORT:-9333}" "$@"; }`.

## Eval snippets

```bash
ab console | grep -iE "webpack-dev-server|hmr|fast-serve|error"
ab eval '(()=>{const s=document.querySelector("[class*=helloWorld_]");return s?s.innerText.slice(0,120):"not found"})()'
ab eval 'Object.keys(window.require.s.contexts._.defined).filter(k=>/_\d+\.\d+\.\d+$/.test(k))'
ab eval 'window.__themeState__.theme.themePrimary'
ab eval 'performance.getEntriesByType("resource").filter(e=>e.name.startsWith("https://localhost")).length'
ab eval 'JSON.stringify(performance.getEntriesByType("resource").filter(e=>e.name.startsWith("https://localhost")).sort((a,b)=>b.duration-a.duration).slice(0,10).map(e=>[e.name.replace(/^https:\/\/localhost:\d+/,""),Math.round(e.duration)]))'
ab eval 'sessionStorage.getItem("spfx-debug")'
ab screenshot /tmp/spfx-debug.png
```

- fast-serve's dev-server client (Rspack) is silent when it connects; its messages appear as `[webpack-dev-server]` / `[HMR]` only at warning level or above. A page load requests `manifests.js`, one bundle per SPFx bundle on the page and its assets from `localhost`, not hundreds of modules.
- Component DOM: SPFx CSS module class names look like `<name>_<hash>`, so match with `[class*=<name>_]`; web parts sit in `[data-sp-feature-tag]` / `.ControlZone` elements.
- RequireJS `defined` keys `<componentId>_<version>` show which components and SPFx libraries (tenant versions) the page loaded.
- `window.__themeState__.theme`: the theme that `[theme:…]` style tokens resolve against.
- Resource timing: how many modules came from the dev server and the slowest ones. For full network/console capture use agent-browser's network commands (`agent-browser skills get core --full`) or raw CDP.
- `ab console` shows the buffered console; read it after the action you care about and filter it, SharePoint is noisy.

## Loading a component by id (no page edit)

Checks that a component's module loads and its imports resolve, without adding it to a page (it doesn't render it):

```bash
ab eval '(async()=>{const d=window.require.s.contexts._.defined;const k=Object.keys(d).find(k=>k.startsWith("1c6c9123-7aac-41f3-a376-3caea41ed83f_"));const m=await d[k].SPComponentLoader.loadComponentById("<componentId>");return Object.keys(m)})()'
```

`1c6c9123-7aac-41f3-a376-3caea41ed83f` is `@microsoft/sp-loader`; it resolves to the component's exports (`["default"]`). The page must have the debug query so the local manifests are registered. Leave out the version (or pass exactly the `package.json` version that replaces `"version": "*"`): a version that isn't in the debug manifests makes SharePoint ask its server and fail with `ManifestProvider GetClientSideComponents failed with HTTP status 400`.

## Proving a hot update

0. Check `ab eval 'document.visibilityState'` is `"visible"`: with another tab active (for example one restored from the profile's last session, see `ab tab`) the page is hidden, timers run once per second and hot updates arrive up to a second late. Close the other tabs.
1. `ab eval 'window.__spfxMark="alive"'`.
2. Click a state counter (or type into an input) so the component holds non-initial state. If the component has none, the marker alone tells reload vs update.
3. Edit a source file in the SPFx project.
4. Poll: `ab eval '[window.__spfxMark, document.querySelector("[class*=helloWorld_]")?.innerText.slice(0,80)]'` every ~250 ms for a few seconds.
5. Marker kept + new text + counter kept → hot update (Fast Refresh). Marker gone → the page reloaded.
6. Restore the file and confirm the page returns to the original.

Under fast-serve (Rspack: HMR inside the bundles with React Fast Refresh, also with several bundles on one page):

| Edit | Result |
|---|---|
| `.tsx` function component in a file that exports only components | hot update, state kept |
| `.module.scss` / `.scss` / `.css` imported by such a component | styles applied in place (the component re-renders with the new class names; style elements don't pile up) |
| component file that also exports values (hooks, constants) | reload |
| web part / extension / ACE class and what only it imports (services; ACE card/quick views, templates) | reload |
| loc files (`loc/*.js`) | reload |
| manifests, `config/*.json`, `package.json`, `tsconfig.json`, `config/sass.json` | not picked up while serving yet: restart fast-serve |
| `serve.json` | read at start: restart to get a new URL |

`heft start` always rebuilds and reloads.
