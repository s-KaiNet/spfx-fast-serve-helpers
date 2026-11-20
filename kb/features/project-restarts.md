---
title: Restarts on project changes
type: feature
status: current
tags:
  - project-kb
  - dev-session
  - restarts
  - configuration
---

# Restarts on project changes

## Summary

`fast-serve` runs a dev session above the dev server: when a file that defines the project or the server changes, the session reads everything again (options, project model, extend file), builds a new Rspack config and compiler, and only then swaps the running server for a new one on the same port. A broken edit is reported and the previous server keeps running. Open SharePoint pages reload by themselves after a restart.

## Behavior

### What restarts

| Edit | Result |
|---|---|
| `package.json`, `config/config.json` (bundles, components, externals, localized resources), `config/serve.json`, `config/sass.json`, `fast-serve/config.json` | restart |
| the tsconfig chain (`tsconfig.json` and every file it `extends`, rig files included) | restart |
| a component manifest in `src` | restart |
| a linked library project's `package.json`, `config/config.json`, Library manifest or tsconfig chain ([local library projects](local-library-projects.md)) | restart, reason named relative to the project (`../corp-lib/config/config.json changed, …`) |
| `fast-serve/rspack.extend.*` or any local file it imports | restart, see [Rspack extend file](rspack-extend-file.md) |
| an extend file added or removed | restart |
| a local-file `config.json` external | no restart: served live and the page reloads ([libraries and externals](libraries-and-externals.md)) |
| source files in `src` | normal rebuild and [HMR](hmr.md) |

A file counts as changed only when its content changed (saves without changes, `touch` and editor temp files don't restart). Several changes within ~100 ms make one restart; changes during a restart queue one more restart.

### Messages

- The reason, one line: `config/sass.json changed, restarting fast-serve`, `fast-serve/rspack.extend.mjs found, …`, `… was removed, …`, `config/helpers.cjs (imported by fast-serve/rspack.extend.mjs) changed, …`; several files: the first plus `(+n more)`.
- After the swap: option and serve-configuration warnings again, `Rspack config: <file>` and extend guard warnings, the compile line, then `restarted in N ms at https://localhost:<port>`. The full ready banner (components, page and debug URL) is printed instead when the port, page, serve configuration or component list changed.
- A failing restart (unreadable `config/config.json`, a broken extend file, an invalid Rspack config): `restart failed: <reason>` or `<extend file> could not be loaded: <reason>`, then `The server keeps running with the previous configuration; fast-serve restarts when the file is fixed.` The next content change of a watched file tries again; a broken extend file's own imports are watched from then on, too.
- Only when the new server cannot listen after the old one closed (for example another process took the port meanwhile) `fast-serve` prints `restart failed: …` and exits with 1.

### Pages after a restart

Every server start uses a new compilation hash salt. The pages' dev-server clients reconnect to the new server, see a new hash, try a hot update against the previous hash, get no update and reload the page. Measured live on spfx-rea: an edit of the extend file → new values on the page in about 4 s including the SharePoint page reload; the server itself restarted in 0.18–0.25 s. HMR keeps working on the restarted server (a TSX edit hot-updated with the component state kept). Restarts use the [persistent cache](performance-and-cache.md): a changed configuration file changes the cache version, so the restarted compile is uncached, but loaders and Sass are already loaded in the process, so it takes 0.1–0.5 s on spfx-rea; the hash salt is not part of the cache version.

### Unchanged options

The option set for this line: `port`, `pageUrl`, `locale`, `serveConfiguration`, `overlay` (flags or `fast-serve/config.json`) and the file-only `deployedLibraries`. A changed `fast-serve/config.json` or `config/serve.json` takes effect at the restart, including a new port.

## Implementation Notes

- Bundler-free preparation (options, model, extend file) and the new compiler are created while the old server still runs; the old server and compiler are closed only when that succeeded. A prepared compiler that is no longer needed is closed.
- File watching is per folder (non-recursive) with a content hash per watched file, so atomic saves and files in folders created later are seen; folders that don't exist yet are covered by watching the nearest existing parent.
- Each restart builds a fresh project model; the model's own invalidation is not used by the session.
- The webpack-customization hint and the setup summary are printed only at the first start.

## Links

- [Startup performance and the persistent cache](performance-and-cache.md)
- [CLI, options and startup](cli-and-options.md)
- [Rspack extend file](rspack-extend-file.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [Project model](../architecture/project-model.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: integration test with a real session (edits of an extend helper, a broken and fixed extend file, `config/sass.json`, a broken and restored `config/config.json`, extend file removal, served bundle and headers checked after each step); unit tests for the watcher and the restart reasons; live on a copy of spfx-rea (`1.24.0-rspack.9`): extend file added while running, helper edit, extend edit, broken edit kept the server and the page, fix restarted, `config/sass.json` edit restarted, page reloaded by itself each time
- Confidence: high
- Last checked: 2026-11-19
