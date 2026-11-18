---
title: Environment and browser gotchas
type: limitation
status: current
tags:
  - project-kb
  - limitations
  - debugging
  - certificate
  - local-network-access
  - remote-development
---

# Environment and browser gotchas

## Summary

Most "nothing loads" problems come from the browser and SharePoint side of the debug flow, not from `fast-serve`: SharePoint's sticky debug mode, an untrusted development certificate, Chrome/Edge's Local Network Access prompt, addressing the server as anything but `localhost`, port clashes with `heft start`, and remote setups where the browser runs on another machine. The symptom is usually "Error loading debug manifests" on the page.

## Current Knowledge

| Gotcha | Cause | Symptom | Workaround |
|---|---|---|---|
| Sticky debug mode | SharePoint remembers the debug query for the tab in `sessionStorage["spfx-debug"]` | after stopping `fast-serve`, opening the page without the query in the same tab still tries `localhost`: "Error loading debug manifests" or a CSP error | open a new tab, or clear `sessionStorage["spfx-debug"]` |
| Untrusted certificate | HTTPS always uses the SPFx (Rushstack) development certificate | `ERR_CERT_AUTHORITY_INVALID`, "Error loading debug manifests"; at start `No valid SPFx development certificate found` | `npx heft trust-dev-cert` once per machine (the same certificate `heft start` uses), then restart the browser |
| Local Network Access prompt | Chrome/Edge ask whether a public site may reach local network devices (`https://localhost`) | manifests blocked until allowed | allow the prompt; the server sends `Access-Control-Allow-Private-Network` |
| Wrong host name | SharePoint's CSP allows `localhost:*` scripts only, and only with the debug parameters present | scripts blocked when using `127.0.0.1` or another name | always use `localhost` |
| Port clash | `heft start` and `fast-serve` both default to 4321 | `Port 4321 is already in use` | run one at a time, or `--port` / `"port"` |
| "Allow debug scripts?" | SharePoint asks on the first debug load | nothing loads until confirmed | click **Load debug scripts** |
| Component not on the page | the debug manifest only registers components | a web part doesn't appear | add it from the toolbox while `fast-serve` runs and save the page; ACEs appear under their manifest title |
| VS Code debugging profile | VS Code launches a separate browser profile | sign-in, debug-scripts and LNA prompts appear again | sign in once in that profile; the `launch.json` mapping is documented but not yet verified with F5 in real VS Code |

### Remote and SSH setups

- The server listens on `localhost` with a certificate generated on the machine running `fast-serve`, while the browser runs on the developer's machine.
- To use it remotely: forward the **same port** (for example an SSH local forward of 4321 to 4321), so the printed debug URL `https://localhost:<port>/temp/build/manifests.js` and the absolute asset/module URLs still resolve; and trust the dev certificate's CA **on the client machine** where the browser runs (trusting it only on the server doesn't help).
- Tunnels, containers, Docker/WSL-specific setup are not supported beyond this (see [Unsupported scope](unsupported-scope.md)).

## Links

- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [CLI, options and startup](../features/cli-and-options.md)
- [Errors and diagnostics](../features/errors-and-diagnostics.md)
- [Known issues and fragile points](known-issues.md)

## Evidence

- Source: user docs (migration, troubleshooting, VS Code debugging guide), project handoff notes (gotchas, live debugging pitfalls), live verification on the test tenant; remote/SSH guidance from the orchestrator brief, consistent with the localhost-only design but not recorded in project docs
- Confidence: high; remote/SSH medium
- Last checked: 2026-11-18
