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

Everything that involves the SharePoint page (manifest loading, the bundle shim, SPFx libraries, HMR, overlay, extensions, ACEs) is verified live on the dev tenant by an agent driving a headless Chrome through agent-browser. Chrome is started manually with a saved, logged-in profile and flags that accept the dev certificate and skip Local Network Access checks; agent-browser connects over CDP. This page is the procedure, the useful checks, how to prove a hot update, and the cleanup rules.

## Current Knowledge

### Prerequisites

- `fast-serve` (or `heft start`, for comparison) runs in a test project on `https://localhost:<port>`, with a freshly reinstalled tarball after any package change (see [Local testing and consumer setup](local-testing-and-consumer-setup.md)).
- The SPFx dev certificate exists in the user's Rushstack folder (`~/.rushstack/`).
- The saved browser profile `/home/sergei/.agent-browser-profiles/mastaq-sharepoint` is logged in to the tenant (see the `agent-browser-profile` skill). Profile contents are authentication secrets: never print, copy or commit them.

### Rules for the browser profile

- Always invoke agent-browser as `env -u XDG_RUNTIME_DIR agent-browser ...` (a socket-path quirk on this host; without it a second daemon can start and hit the profile lock).
- **One Chrome per profile.** Check `pgrep -af mastaq-sharepoint` first; never delete lock files and never switch to a fresh profile (that loses the login).
- If Microsoft asks to sign in, let the user sign in through the agent-browser dashboard (`env -u XDG_RUNTIME_DIR agent-browser dashboard start`, http://localhost:4848). Never ask for credentials.

### Start Chrome and open the page

Start Chrome yourself; agent-browser's own `--args` did not apply the certificate and LNA flags reliably:

```bash
/home/sergei/.agent-browser/browsers/chrome-153.0.8010.36/chrome --headless=new --no-sandbox \
  --user-data-dir=/home/sergei/.agent-browser-profiles/mastaq-sharepoint \
  --ignore-certificate-errors --disable-features=LocalNetworkAccessChecks,Translate \
  --remote-debugging-port=9333 --window-size=1280,900 about:blank &
AB="env -u XDG_RUNTIME_DIR agent-browser --session vite-dev --cdp 9333"
$AB open 'https://mastaq.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true'
```

- Without `--ignore-certificate-errors` and `--disable-features=LocalNetworkAccessChecks` the page shows "Error loading debug manifests" (`ERR_CERT_AUTHORITY_INVALID` or an LNA block).
- First visit: the "Allow debug scripts?" dialog appears; take an interactive snapshot (`$AB snapshot -i`) and click **Load debug scripts** (`$AB click @eN`).
- Extensions: use the URL `fast-serve --config <name>` prints (`loadSPFX=true&customActions=…` or field/form customizer parameters, no `debug=true`).
- ACEs: the hosted workbench (`/_layouts/15/workbench.aspx`) keeps an unsaved canvas across reloads until its retirement on 2026-12-01; afterwards use a draft page.

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

- `$AB close`, then stop the Chrome you started (`pgrep -f remote-debugging-port=9333`) and your dev server. Never kill processes you didn't start.
- **Never save or publish tenant pages.** Test pages stay drafts; edits on the workbench are not saved.
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

- Source: project handoff notes (live debugging procedure, pitfalls), agent-browser profile skill, live verification runs on the tenant
- Confidence: high
- Last checked: 2026-11-18
