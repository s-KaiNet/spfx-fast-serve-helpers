---
title: Live verification on a SharePoint tenant
type: operation
status: current
tags:
  - project-kb
  - operations
  - verification
  - agent-browser
  - sharepoint
  - hmr
---

# Live verification on a SharePoint tenant

## Summary

Everything that involves the SharePoint page (manifest loading, the bundle shim, SPFx libraries, HMR, overlay, extensions, ACEs) is verified live on the dev tenant by an agent driving a headless Chrome through agent-browser. Chrome is started manually with a saved, logged-in profile and flags that accept the dev certificate and skip Local Network Access checks; agent-browser connects over CDP. This page is the procedure, the useful checks, how to prove a hot update, and the cleanup rules. The procedure is packaged as the repository's `spfx-debugging` agent skill, configured only through environment variables in a git-ignored `.env` file.

## Current Knowledge

### The `spfx-debugging` skill

- A repository agent skill for live-debugging web parts, extensions and ACEs served by `fast-serve` or `heft start` inside a real SharePoint page: it starts and stops the headless Chrome on the saved profile with the right flags, builds debug URLs, and documents the checks, the hot-update test, pitfalls and cleanup described on this page.
- Configuration is only environment variables loaded from the project's `.env` (git-ignored; an example file lists the keys):

| Variable | Required | Meaning |
|---|---|---|
| `SPFX_DEBUG_BROWSER_PROFILE` | yes | Chrome user data folder already signed in to the tenant |
| `SPFX_DEBUG_PAGE_URL` | for web parts | SharePoint page that holds the web parts |
| `SPFX_DEBUG_LIST_URL` | no | list view for Command Sets and Field Customizers |
| `SPFX_DEBUG_CHROME` | no | Chrome binary (default: the newest agent-browser-managed Chrome, then one on `PATH`) |
| `SPFX_DEBUG_CDP_PORT` | no | remote debugging port, default `9333` |
| `SPFX_DEBUG_DEV_SERVER_PORT` | no | dev server port, default `4321` |
| `SPFX_SERVE_TENANT_DOMAIN` | no | `{tenantDomain}` for `config/serve.json` and `fast-serve/config.json` |

- If a variable needed for the task is missing, the agent stops and asks; tenant URLs, page URLs and profile paths are never guessed.

### Prerequisites

- `fast-serve` (or `heft start`, for comparison) runs in a test project on `https://localhost:<port>`, with a freshly reinstalled tarball after any package change (see [Local testing and consumer setup](local-testing-and-consumer-setup.md)).
- The SPFx dev certificate exists in the user's Rushstack folder (`~/.rushstack/`).
- A saved browser profile is logged in to the tenant. Profile contents are authentication secrets: never print, copy or commit them.

### Rules for the browser profile

- If agent-browser starts a second daemon on the same profile (for example because of a socket-path quirk in the environment), it hits the profile lock; make sure all calls reach the same daemon.
- **One Chrome per profile.** Check for a running Chrome on that profile first; never delete lock files and never switch to a fresh profile (that loses the login).
- If Microsoft asks to sign in, let the user sign in through the agent-browser dashboard (`agent-browser dashboard start`). Never ask for credentials.

### Start Chrome and open the page

Start Chrome yourself; agent-browser's own `--args` did not apply the certificate and LNA flags reliably:

```bash
<chrome> --headless=new --no-sandbox \
  --user-data-dir=<saved profile> \
  --ignore-certificate-errors --disable-features=LocalNetworkAccessChecks,Translate \
  --remote-debugging-port=<cdp port> --window-size=1280,900 about:blank &
AB="agent-browser --session vite-dev --cdp <cdp port>"
$AB open 'https://<tenant>.sharepoint.com/sites/<site>/SitePages/<test page>.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A<port>%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true'
```

- Without `--ignore-certificate-errors` and `--disable-features=LocalNetworkAccessChecks` the page shows "Error loading debug manifests" (`ERR_CERT_AUTHORITY_INVALID` or an LNA block).
- First visit: the "Allow debug scripts?" dialog appears; take an interactive snapshot (`$AB snapshot -i`) and click **Load debug scripts** (`$AB click @eN`).
- Extensions: use the URL `fast-serve --config <name>` prints (`loadSPFX=true&customActions=…` or field/form customizer parameters, no `debug=true`).
- ACEs: a test page in edit mode, card from the toolbox; interaction needs the page saved and read mode, so only with the user's permission to edit and save that page. Without it, check the module load and report rendering as unverified.

### Useful checks

```bash
$AB console | grep -iE "error|vite|fast-serve"
$AB eval '(()=>{const s=document.querySelector("[class*=helloWorld_]");return s?s.innerText.slice(0,80):"not found"})()'
$AB eval 'Object.keys(window.require.s.contexts._.defined).filter(k=>/_\d+\.\d+\.\d+$/.test(k))'
$AB eval 'window.__themeState__.theme.themePrimary'
$AB eval '(()=>{const r=performance.getEntriesByType("resource").filter(e=>e.name.startsWith("https://localhost"));return r.length})()'
$AB screenshot /tmp/shot.png
```

- `[vite] connected.` in the console means the HMR client is up.
- The RequireJS `defined` list shows which SPFx modules and versions the page loaded (the tenant serves its own version, for example 1.25.0 for a 1.24.1 project).
- `window.__themeState__.theme` is the theme that style tokens resolve against.
- The count of `https://localhost` resources shows how many modules the page fetched from the dev server.

### Proving a hot update

1. Set a marker on the page: `$AB eval 'window.__mark="alive"'`.
2. Click a state counter in the component so it holds a non-initial value.
3. Edit a source file in the test project (text, style, or the component class).
4. Poll the DOM for the change. If the marker survives and the counter keeps its value, it was a hot update (Fast Refresh); if the marker is gone, the page reloaded. Use this to confirm the expected outcome for each edit type (see [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)).
5. **Always restore the edited files** afterwards.

For timings, network and console capture without agent-browser, the benchmark harness drives Chrome through raw CDP (see [Benchmark method](benchmark-method.md)).

### Cleanup and safety

- `$AB close`, then stop the Chrome you started (match it by its `--remote-debugging-port`) and your dev server. Never kill processes you didn't start.
- **Never save or publish tenant pages.** Test pages stay drafts.
- HAR files contain auth cookies: keep them outside repositories.

### Pitfalls

- Opening the page without the debug query in a tab that had it → "Error loading debug manifests" (the debug mode is sticky in `sessionStorage["spfx-debug"]`). Use a new tab or clear that key.
- The server must be addressed as `localhost`, not `127.0.0.1`: SharePoint's CSP allows only `localhost:*`.
- An overlay opened during page load turns the first edit into a full reload (Vite's rule), which can be mistaken for a broken hot update.

## Links

- [Local testing and consumer setup](local-testing-and-consumer-setup.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)
- [Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)
- [Known issues and fragile points](../limitations/known-issues.md)

## Evidence

- Source: project handoff notes (live debugging procedure, pitfalls), the `spfx-debugging` skill, browser profile instructions, live verification runs on the tenant
- Confidence: high
- Last checked: 2026-11-19
