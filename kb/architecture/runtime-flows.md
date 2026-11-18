---
title: Startup and request flows
type: architecture
status: current
tags:
  - project-kb
  - architecture
  - startup
  - hmr
  - errors
---

# Startup and request flows

## Summary

This page traces `fast-serve` end to end: what happens at startup, how a SharePoint page load reaches a rendered component, what an edit does (hot update, page reload or server restart), and how failures surface in the terminal, the overlay and the web part's error box. It is the runtime view of the components described in the [Architecture overview](overview.md).

## Current Knowledge

### Startup sequence

1. **SPFx version check**: the installed SPFx version (from `@microsoft/sp-core-library`, falling back to `@microsoft/spfx-heft-plugins`) must match the package's `major.minor`; otherwise `fast-serve` exits with `Unsupported SPFx version`.
2. **Project model and options**: the model is created, options are resolved with `serve.json` as defaults, and option and serve-configuration warnings are printed. No supported component in `config/config.json` bundles is a fatal error (library components are not served).
3. **Certificate**: the SPFx/Rushstack dev certificate (the one `heft trust-dev-cert` manages) is loaded for HTTPS.
4. **Vite server**: created with `configFile: false`, `appType: 'custom'` and the composed plugins; `server.origin` is set so asset URLs are absolute, the host is `localhost` (SharePoint's CSP allows `localhost:*`, not `127.0.0.1`), the port is strict.
5. **Listen**: a port in use fails with a message suggesting `--port` or `port` in `config/fast-serve.json`; any startup failure closes the server and the CLI exits with code 1. The ready banner lists web parts, extensions and ACEs, the serve configuration and the `open:` URL with the debug query (or the query to append), plus a reminder that the debug query sticks to the tab.
6. **Pre-bundling**: Vite's dependency optimizer scans from the component entry files (there is no `index.html`) and pre-bundles dependencies in the background, with React always included. The server is ready before pre-bundling finishes.
7. **Typings**: as soon as the server listens, static-asset and Sass typings are generated; afterwards they follow add/change/unlink.

Nothing else is compiled ahead: there is no startup warmup, so project files compile when the page first requests them and the first page load after a start is slower than later ones (see [Unbundled dev server without startup warmup](../decisions/unbundled-dev-without-warmup.md)).

### Page load to rendered component

1. The user opens the SharePoint page with the debug query (see [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)). sp-loader asks to allow debug scripts and fetches `/temp/build/manifests.js`.
2. **Debug manifests**: for each component, its source manifest with `loaderConfig.entryModuleId` = bundle name, `internalModuleBaseUrls` = the dev server origin, `scriptResources` = the bundle shim (`type: "path"`), `@microsoft/sp-loader` (`type: "component"`) and every `config.json` external, plus `exportName` when the bundle holds several components.
3. **Bundle shim** (`/@spfx/bundle/<bundle>.js`, a classic AMD script): installs the library loader once per page and defines each component module id (`<componentId>_<version>`) through a RequireJS loader plugin. When RequireJS asks for the component, the plugin hands the component-scoped `require` to the library loader and dynamically `import()`s the bundle entry from the dev server.
4. **Bundle entry** (`/@spfx/entry/<bundle>`, generated ESM): imports the browser-errors runtime first, then `@vitejs/plugin-react/preamble`, re-exports each component (`export * as <exportName>` for multi-component bundles, otherwise `export *` plus `default`), and accepts hot updates that reach it with `location.reload()`.
5. Vite serves the module graph; SPFx library imports resolve through on-demand facades that await the page's own library instances (see [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md)).
6. The entry's exports go back to RequireJS; SharePoint instantiates the component class as with a production bundle.

All bundles share one ESM module graph in dev (one instance of a shared module), unlike production where each bundle has its own copy.

### Edit flow

- **Source module edit**: Vite's HMR propagates the change up the import graph. React components accept it through Fast Refresh (state kept); style modules are swapped in place, with theme tokens resolved again; facades are not re-evaluated. An update that reaches the bundle entry (component class, files that also export non-components, modules only the class imports) reloads the page.
- **New imports** during a session (including a new `@microsoft/sp-*` package, even one the page never loaded) hot-update, because facades load libraries on demand. A brand-new npm dependency triggers re-pre-bundling and one reload.
- **Project-model files** (`package.json`, `config/config.json`, `config/serve.json`, component manifests, the tsconfig chain, local external files): the model invalidates the affected part and the page fully reloads. A tsconfig change also invalidates every transformed module so imports re-resolve; if it changes the transform options passed to Oxc, the server restarts. Editing the project's `config/sass.json` restarts the server so the new Sass options apply. A changed serve configuration only changes the printed URL after a restart.
- Build output folders (`lib`, `lib-commonjs`, `lib-esm`, `lib-dts`, `dist`, `temp`, `release`, `sharepoint`, `teams`, `jest-output`, `.heft`) are not watched.

### Failure flow

- **Compile error during a hot update**: Vite's overlay, the browser console and the terminal show it; saving the fix applies the update.
- **Bundle fails to load** (compile error at page load, unreachable server, missing export): the shim's `import()` rejects. The shim asks `/@spfx/status` (`{ error, fileRevision }`; the server records the last transform/middleware error) and builds a readable message: the server error with its location, or a hint that a module failed to compile or the server is unreachable, plus a `const enum`/type-only hint for "does not provide an export named". It logs the error, replaces SharePoint's unreadable `[object Object]` in the web part's error box, reports the failure to RequireJS, and polls `/@spfx/status` to reload the page after the next file change (backing off while the server is unreachable, pausing after 10 minutes until the tab is visible again).
- **SPFx library fails to load**: the library loader reports which library, component id and version failed; when the page only serves older versions it explains that the project uses a newer SPFx than the tenant (which would also fail in production).
- **Runtime errors from project code**: the browser-errors runtime sends uncaught errors, unhandled rejections and `console.error` calls over the HMR socket, once per error object. The server reports only errors with a stack frame in a project module on its origin or in the loader, maps frames through the module graph's source maps, trims after the last own frame and prints a code frame. Uncaught errors and rejections (not `console.error`) are also sent back to the reporting page as a Vite error payload, so Vite's overlay shows them (off with the `overlay` option; one signature is shown once, so React's replayed render errors appear once). Messages already printed by `fast-serve` or Vite are skipped.
- ESM caches failed evaluations: a facade or module that failed stays failed until the page reloads.

## Links

- [Architecture overview](overview.md)
- [SPFx libraries and externals at runtime](spfx-libraries-and-externals.md)
- [Source pipeline](source-pipeline.md)
- [SharePoint debug flow](../concepts/sharepoint-debug-flow.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [HMR, Fast Refresh and Vite terms](../concepts/hmr-and-vite-terms.md)
- [Errors and diagnostics](../features/errors-and-diagnostics.md)
- [HMR and Fast Refresh](../features/hmr-and-fast-refresh.md)
- [Unbundled dev server without startup warmup](../decisions/unbundled-dev-without-warmup.md)

## Evidence

- Source: project handoff notes, HMR and debugging docs, implementation behavior (dev server bootstrap, loader, server and browser-errors components, browser runtime); verified live on a SharePoint Online tenant during acceptance
- Confidence: high
- Last checked: 2026-11-18
