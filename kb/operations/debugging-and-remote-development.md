---
title: VS Code debugging and remote development
type: operation
status: current
tags:
  - project-kb
  - operations
  - debugging
  - vscode
  - remote-development
  - certificate
---

# VS Code debugging and remote development

## Summary

User code served by `fast-serve` can be debugged in browser DevTools or in VS Code with a `launch.json` that opens the SharePoint debug page and maps `https://localhost:4321/` to the workspace folder; the VS Code setup is documented but still awaits a manual F5 check in real VS Code. When `fast-serve` runs on a remote Linux machine and the browser on Windows (SSH development), the browser side needs the same `localhost` URL and a trusted certificate: forward the same port over SSH and import the Rushstack CA certificate into the Windows user's root store. This remote setup is verified end to end.

## Current Knowledge

### Why it works

Every module is served from `https://localhost:<port>/<path in the project>` with an inline source map containing the original TypeScript, so DevTools and VS Code see the real `.ts`/`.tsx` files. VS Code only needs to know that the dev server root is the project folder (see [Errors and diagnostics](../features/errors-and-diagnostics.md)).

### VS Code `launch.json`

1. Start `npm run serve` first; VS Code does not start it.
2. Add `.vscode/launch.json` in the SPFx project with a `msedge` or `chrome` configuration (`"request": "launch"`):
   - `url`: the page URL `fast-serve` prints (`open: ...`), including the debug query;
   - `webRoot`: `${workspaceFolder}`;
   - `pathMapping`: `{ "https://localhost:4321/": "${workspaceFolder}/" }`;
   - `sourceMapPathOverrides`: `{ "https://localhost:4321/*": "${workspaceFolder}/*" }`;
   - `"outFiles": []`, so VS Code does not scan `lib/`, `dist/` and `temp/` for heft's webpack source maps before starting.
   Adjust the port if it was changed.
3. F5 opens a separate browser profile: sign in to SharePoint once, click **Load debug scripts**, allow local network access if asked.
4. Breakpoints in `src/**/*.ts(x)` bind when the module loads; reload the page to hit code that already ran (`render`, `onInit`).

Notes: `pwa-chrome` / `pwa-msedge` are older names of the same debuggers. Old `webpack:///` entries in `sourceMapPathOverrides` (from the SPFx template or the classic spfx-fast-serve) are unused by `fast-serve`. To attach to a running browser instead, start it with `--remote-debugging-port=9222`, open the debug page there and use `"request": "attach"` with `port`, a `urlFilter` for the SharePoint site and the same mappings. Without VS Code, DevTools lists the files under `localhost:4321/src/...` (Ctrl+P / Cmd+P).

**Status:** the configuration is documented in the user docs, DevTools source maps work, but launching with F5 in real VS Code has not been verified yet (see [Known issues](../limitations/known-issues.md)).

### Remote development over SSH from Windows

`fast-serve` listens on `localhost` with the Rushstack development certificate generated on the machine where it runs; SharePoint's CSP only allows `localhost:*` scripts. When the project lives on a remote Linux host and the browser runs on Windows:

1. **Forward the same port** from Windows to the remote host, for example `ssh -L 4321:localhost:4321 <host>` (or VS Code Remote-SSH port forwarding, keeping the local port equal to the remote one). The printed debug URL, the manifest URLs and the absolute module and asset URLs all contain `https://localhost:<port>`, and the HMR WebSocket uses the same origin, so the port must match on both sides.
2. **Trust the CA on Windows.** `npx heft trust-dev-cert` on the remote host only trusts it there. Copy the CA certificate (`rushstack-ca.pem` in `~/.rushstack/` on the remote host) to Windows and import it into the current user's **Trusted Root Certification Authorities** store (certificate manager, or `certutil -user -addstore Root rushstack-ca.pem`), then restart the browser.
3. Open the printed URL in the Windows browser and allow the Local Network Access prompt.

This setup has been verified end to end by the user: with the CA imported into the Windows user root store and the same port forwarded over SSH, the Windows browser loads the debug page, the components and HMR from the remote `fast-serve`.

Tunnels (ngrok), containers, Docker and WSL-specific setups are not supported (see [Unsupported scope](../limitations/unsupported-scope.md)).

## Links

- [Errors and diagnostics](../features/errors-and-diagnostics.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Environment and browser gotchas](../limitations/environment-and-browser-gotchas.md)
- [Known issues and fragile points](../limitations/known-issues.md)
- [Local testing and consumer setup](local-testing-and-consumer-setup.md)

## Evidence

- Source: VS Code debugging guide in the user docs, project handoff notes (open items), Rushstack certificate files; SSH-from-Windows setup verified by the user
- Confidence: stated for the `launch.json` content, uncertain for F5 behavior (unverified), stated for the SSH procedure (user-verified)
- Last checked: 2026-11-18
