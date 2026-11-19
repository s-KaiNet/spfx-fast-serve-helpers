---
name: spfx-debugging
description: Live-debug SPFx web parts, extensions and Adaptive Card Extensions inside a real SharePoint page with a headless Chrome (saved logged-in profile) driven by agent-browser over CDP. Use when you need to verify that a component served by fast-serve or `heft start` loads, renders, hot-updates or shows errors on a SharePoint tenant, take screenshots of it, or inspect its console, network, RequireJS modules or theme. Configured only through `SPFX_DEBUG_*` environment variables from the project's `.env`.
---

# SPFx live debugging in SharePoint

Drive a headless Chrome that uses the user's saved SharePoint login, open a SharePoint page with the SPFx debug query, and inspect the components served from `https://localhost:<port>`. Works with any SPFx project served by `fast-serve` or `heft start`.

Read `agent-browser skills get core` once for the general agent-browser commands. Scripts below live in this skill's `scripts/` folder (`<skill>` = the folder of this file).

## 1. Configuration (environment only)

Every shell call starts fresh, so load `.env` from the project root in each command that needs it:

```bash
set -a; [ -f ./.env ] && . ./.env; set +a
```

| Variable | Required | Meaning |
|---|---|---|
| `SPFX_DEBUG_BROWSER_PROFILE` | yes | Chrome user data dir that is already signed in to the tenant |
| `SPFX_DEBUG_PAGE_URL` | for web parts | SharePoint page that has the web parts on it |
| `SPFX_DEBUG_WORKBENCH_URL` | no | hosted workbench `…/_layouts/15/workbench.aspx` (ACEs; retired by Microsoft on 2026-12-01) |
| `SPFX_DEBUG_LIST_URL` | no | list view for Command Sets / Field Customizers |
| `SPFX_DEBUG_CHROME` | no | Chrome binary; default: newest agent-browser-managed Chrome (`~/.agent-browser/browsers/chrome-*/chrome`), then `google-chrome`/`chromium` on PATH |
| `SPFX_DEBUG_CDP_PORT` | no | Chrome remote debugging port, default `9333` |
| `SPFX_DEBUG_DEV_SERVER_PORT` | no | dev server port, default `4321` |
| `SPFX_SERVE_TENANT_DOMAIN` | no | read by fast-serve and heft for `{tenantDomain}` in `config/serve.json` / `fast-serve/config.json` |

If a variable needed for the task is missing, **stop and ask the user**. Never guess tenant URLs, page URLs or profile paths, and never invent a profile. `.env` is git-ignored; `.env.example` lists the keys.

## 2. Preconditions

- **Dev server** running on `https://localhost:<port>` (`npm run serve` / `fast-serve [--port N]`, or `heft start`). Check the port first (`ss -ltnp | grep :<port>`); if it's taken by something you didn't start, don't kill it: pick another port (`fast-serve --port 4399`) and use it in the URL. If you start it yourself, detach it from the tool's process group and log its output, otherwise it dies when the command returns:
  ```bash
  cd <spfx project> && setsid nohup npx fast-serve --port <port> >/tmp/spfx-debug-server.log 2>&1 </dev/null &
  ```
  Note its pid (`pgrep -af '[f]ast-serve --port <port>'`) for cleanup.
- Address it as `localhost`, never `127.0.0.1` (SharePoint's CSP allows only `localhost:*`, and only with the debug query).
- **Certificate:** the SPFx dev cert must exist (`npx heft trust-dev-cert`, files in `~/.rushstack/`). The headless Chrome below ignores certificate errors and skips Local Network Access checks, so trust is only needed for the user's own browser.
- **One Chrome per profile.** `start-chrome.sh` refuses to start when another Chrome uses the profile. Never delete `Singleton*` lock files, never copy the profile, never use a fresh one (it has no login). If the profile is busy, ask the user.
- **agent-browser socket quirk:** agent-browser finds its daemons through `XDG_RUNTIME_DIR`. When the agent's environment and the user's shell differ there (for example the agent has no `XDG_RUNTIME_DIR` but SSH sessions set `/run/user/<uid>`), the same session name reaches different daemons, and a second daemon on the profile hits the profile lock. In that case run every agent-browser command, including `dashboard start`, as `env -u XDG_RUNTIME_DIR agent-browser …`, consistently. Otherwise plain `agent-browser` is fine.
- **Login:** if the page redirects to `login.microsoftonline.com`, let the user sign in in the live browser view: `agent-browser dashboard start` (http://localhost:4848), select the session. Never ask for credentials or MFA codes.

## 3. Workflow

```bash
set -a; [ -f ./.env ] && . ./.env; set +a
<skill>/scripts/start-chrome.sh
ab() { agent-browser --session spfx-debug --cdp "${SPFX_DEBUG_CDP_PORT:-9333}" "$@"; }
ab open "$(<skill>/scripts/debug-url.sh "$SPFX_DEBUG_PAGE_URL" "${SPFX_DEBUG_DEV_SERVER_PORT:-4321}")"
ab snapshot -i | grep -i "debug scripts"
ab click @eN
ab wait 8000
ab console | grep -iE "vite|fast-serve|error"
ab screenshot /tmp/spfx-debug.png
```

1. Start Chrome with `scripts/start-chrome.sh` (detached with `setsid`, so it outlives the command). It launches `--headless=new --no-sandbox --ignore-certificate-errors --disable-features=LocalNetworkAccessChecks,Translate --remote-debugging-port=<port>` on the profile, waits for CDP and stores the pid in `$TMPDIR/spfx-debug-chrome-<port>.pid`. Start Chrome yourself like this: agent-browser's own `--args` does not apply the certificate and LNA flags reliably, and without them the page shows "Error loading debug manifests".
2. Attach with `--cdp <port>` and a named `--session` (never the unnamed default). Define the `ab` function in every shell call (a function, not a `$AB` string: zsh doesn't word-split variables); add `env -u XDG_RUNTIME_DIR` inside it if the quirk applies.
3. Build the URL (details: [references/debug-urls.md](references/debug-urls.md)):
   - web parts / ACEs: `scripts/debug-url.sh <page> <port>` → `?debugManifestsFile=<encoded https://localhost:<port>/temp/build/manifests.js>&debug=true&noredir=true`, replacing the page's own query;
   - extensions: copy the `open:` URL that `fast-serve --config <name>` (or heft) prints (`loadSPFX=true&customActions=…`, no `debug=true`).
4. First load shows **"Allow debug scripts?"**: `ab snapshot -i`, click the **Load debug scripts** button ref. Re-snapshot after every navigation.
5. Verify: `[vite] connected.` in the console (fast-serve's HMR client), the component's DOM, a screenshot. More checks and the hot-update test: [references/checks.md](references/checks.md).
6. Clean up (section 5).

## 4. Safety rules

- **View only by default.** Never edit, save, publish or delete SharePoint pages, lists or items unless the user explicitly allows it. Opening a page in edit mode autosaves a draft. To add a component without touching a page use the hosted workbench (unsaved canvas) or load the module by id (see checks).
- Edit project source files only when the task needs it (HMR tests) and **restore them** afterwards (`git diff` / `git checkout -- <file>` only for files you changed).
- Profiles, cookies and HAR files contain auth secrets: never print, copy or commit them; keep HARs out of repositories.
- Stop only processes you started. Find them by pid or by a unique argument; note that `pkill -f <pattern>` / `pgrep -f` also match your own shell when the pattern is on its command line (use the pid file or a `[x]yz` pattern).

## 5. Cleanup

```bash
ab eval 'sessionStorage.removeItem("spfx-debug")'
ab close
set -a; [ -f ./.env ] && . ./.env; set +a; <skill>/scripts/stop-chrome.sh
kill <dev server pid you started>
```

Then check `git status` in the SPFx project for leftover edits.

## References

- [references/debug-urls.md](references/debug-urls.md): web parts, extensions, ACEs and the workbench, the "Allow debug scripts?" dialog.
- [references/checks.md](references/checks.md): eval snippets (HMR client, DOM, RequireJS modules, theme, network), loading by id, HMR test, what hot-updates vs reloads.
- [references/pitfalls.md](references/pitfalls.md): known gotchas, error messages and remote (SSH) setups.
