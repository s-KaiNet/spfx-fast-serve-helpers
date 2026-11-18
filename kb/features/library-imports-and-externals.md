---
title: SPFx library imports and config.json externals
type: feature
status: current
tags:
  - project-kb
  - externals
  - sp-loader
  - spfx-libraries
---

# SPFx library imports and config.json externals

## Summary

`@microsoft/sp-*` packages, any other installed SPFx library, and `config/config.json` `externals` are never bundled from `node_modules`: the page's own instances are used, in the tenant's version, exactly as in production. For the developer this means imports look normal, new SPFx imports hot-update, React comes from the project in its development build, and a project newer than the tenant gets a clear error.

## Behavior

### SPFx libraries

- Any import of `@microsoft/sp-*` or of a package that ships an SPFx library manifest (for example `@microsoft/sp-adaptive-card-extension-base`) loads that library from SharePoint on first use; type-only imports load nothing.
- The tenant resolves the request to its own same-major version: a 1.24.1 project on a tenant serving 1.25.0 gets 1.25.0, as in production. A project newer than the tenant fails with a message that the page only serves an older version than the project uses, which would also fail in production.
- Libraries the page already loaded cost about 1 ms; libraries it never loaded are fetched from the CDN when first imported; unused libraries are never fetched.
- Adding a new SPFx import (even of a package the page never loaded) during a session hot-updates instead of reloading. Dynamic `import('@microsoft/sp-…')` works.
- Third-party dependencies (PnP controls, PnPjs) that import SPFx libraries share the same instances as project code.
- If a library's export names can't be read, only its default export is available and a warning is printed.

### React

- React and react-dom always come from the project's `node_modules`, in their development build (needed for Fast Refresh; React DevTools and warnings work), deduplicated to one copy. The tenant's production React is not used for project code.

### `config.json` externals

- URL and local-file externals (`"jquery": "https://…"`, `"lib": "./lib/x.js"`, or `{ "path", "globalName", "globalDependencies" }`) are loaded by SharePoint's RequireJS like in heft; local files are served at `/@spfx/external/<name>.js` and watched (an edit reloads the page).
- Validation warnings (the external is skipped): an entry without a path, a local file that doesn't exist (paths are relative to the project root), a `globalDependencies` entry that isn't a usable external (invalid, circular or an SPFx library). An external with the name of an SPFx library is ignored: the library wins.
- Named imports from an external (`import { ajax } from 'jquery'`) only work when a package with that name is installed (its export names are used); otherwise use the default import.

## Implementation Notes

- The externals component replaces each such import with a facade that waits for SharePoint's loader (top-level await for ES modules, a synchronous facade plus a per-chunk preload inside pre-bundled CommonJS). The debug manifest lists only the bundle shim, `@microsoft/sp-loader` and the `config.json` externals, not the SPFx libraries. Details and measurements: [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md).
- Every external is listed in every component's manifest, because all bundles share one RequireJS `require`.

## Edge Cases

- A library or facade that failed to load stays failed until the page reloads (ES module evaluation is cached).
- Modules that don't import a library may evaluate before it is loaded; only importers wait.
- Using a facade outside a page that loaded the bundle shim throws a clear error.

## Links

- [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [Development React from the project for Fast Refresh](../decisions/development-react.md)
- [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md)

## Evidence

- Source: user docs, migration guide, top-level-await externals research (verified live with a 1.24.1 project on a tenant serving 1.25.0), implementation behavior (externals component, project model)
- Confidence: high
- Last checked: 2026-11-18
