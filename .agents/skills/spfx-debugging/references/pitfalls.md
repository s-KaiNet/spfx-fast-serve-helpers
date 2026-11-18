# Pitfalls

| Symptom | Cause / fix |
|---|---|
| "Error loading debug manifests" | dev server not running, wrong port in the URL, untrusted cert or Local Network Access block (start Chrome with `start-chrome.sh`), or `127.0.0.1` instead of `localhost` |
| same error / CSP error on a page opened **without** the query | debug mode is sticky in `sessionStorage["spfx-debug"]` for the tab: clear it (`sessionStorage.removeItem("spfx-debug")`) or use a new tab |
| scripts blocked by CSP | the debug parameters are missing, or the host isn't `localhost` |
| "Allow debug scripts?" every time / nothing loads | the dialog wasn't confirmed: snapshot and click **Load debug scripts** |
| LNA prompt "access other apps and services on this device" | user browsers: allow it; the headless Chrome skips it via `--disable-features=LocalNetworkAccessChecks` |
| workbench shows unexpected or old components | the hosted workbench **also always** fetches `https://localhost:4321/temp/manifests.js`, besides `debugManifestsFile`. With two servers (for example another project on 4321 and yours on 4399) it mixes their components: use 4321 for the project under test or stop the other server only if it's yours |
| workbench canvas has cards you didn't add | it keeps the unsaved canvas in browser storage, across reloads and sites; remove them, nothing is saved |
| web part box shows `[object Object]` | SharePoint's rendering of a load error; read the browser console and the dev server terminal. fast-serve replaces it with `[fast-serve] Failed to load bundle …` plus the file and line |
| `… older than … used by the project` | project SPFx newer than the tenant's; would fail in production too |
| Field Customizer module loaded but `onInit` never runs | seen on some tenants/list experiences with `heft start` too; not a dev server bug. Check the module in RequireJS `defined`, report it |
| list page fails with extensions | `debug=true` together with `loadSPFX=true`: drop `debug=true` |
| page redirected to `login.microsoftonline.com` | session expired: user signs in via `agent-browser dashboard start`; never ask for credentials |
| `SingletonLock` / profile in use | another Chrome or a second agent-browser daemon owns the profile (see the `XDG_RUNTIME_DIR` quirk in SKILL.md). Never delete locks; ask the user |
| a draft appeared on a page | opening edit mode autosaves; don't enter edit mode without permission. Tell the user if it happened |
| your shell got killed | `pkill -f <pattern>` matched your own command line; stop by pid |
| `Port 4321 is already in use` | another fast-serve/heft is running: use `--port`, don't kill it |

## Remote setup (dev server on a Linux host, browser on Windows over SSH)

1. Forward the **same** port: `ssh -L 4321:localhost:4321 <host>` (or VS Code port forwarding with local = remote port). Manifests, module URLs and the HMR WebSocket all use `https://localhost:<port>`.
2. Trust the CA on Windows: copy `~/.rushstack/rushstack-ca.pem` from the host and import it into the current user's Trusted Root store (`certutil -user -addstore Root rushstack-ca.pem`), restart the browser.
3. Open the printed URL and allow the Local Network Access prompt.

The headless Chrome of this skill runs on the same machine as the dev server, so it needs none of this.
