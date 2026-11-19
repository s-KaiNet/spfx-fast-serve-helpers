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
- Imports from an external behave like heft's webpack output, without reading anything from an installed package of the same name:
  - `import { render } from 'ejs'` reads `render` from the loaded module when the importing module runs (`undefined` if the script doesn't define it);
  - `import * as ejs from 'ejs'` is the module exactly as RequireJS returns it, so a function or class works when the script returns one;
  - `import ApexCharts from 'apexcharts'` is `module.default` when the module has `__esModule`, otherwise the module itself;
  - `export { render } from 'ejs'` and `export * as ejs from 'ejs'` work; `export * from 'ejs'` re-exports nothing (the names only exist at runtime) and `fast-serve` warns to re-export the needed names explicitly;
  - `await import('ejs')` gives a webpack-like namespace: the module's properties plus `default`.
- For an AMD module that sets `__esModule`, `import * as x` is the wrapper object, not its default export: use the default import, the same as with heft.
- A script that defines nothing (returns `undefined`) loads without errors; only reading a name from it fails. If the browser still reports a missing export from an external, the message names the external and says the loaded script doesn't define that property.

## Implementation Notes

- The externals component replaces each such import with a facade that waits for SharePoint's loader (top-level await for ES modules, a synchronous facade plus a per-chunk preload inside pre-bundled CommonJS). The debug manifest lists only the bundle shim, `@microsoft/sp-loader` and the `config.json` externals, not the SPFx libraries. Details and measurements: [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md).
- Every external is listed in every component's manifest, because all bundles share one RequireJS `require`.

## Edge Cases

- A library or facade that failed to load stays failed until the page reloads (ES module evaluation is cached).
- Modules that don't import a library may evaluate before it is loaded; only importers wait.
- Using a facade outside a page that loaded the bundle shim throws a clear error.
- A tenant's Content Security Policy may block an external loaded from a CDN URL; that happens with heft too and is not specific to `fast-serve`.

## Links

- [SPFx libraries and externals at runtime](../architecture/spfx-libraries-and-externals.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [HMR and Fast Refresh](hmr-and-fast-refresh.md)
- [Errors and diagnostics](errors-and-diagnostics.md)
- [Development React from the project for Fast Refresh](../decisions/development-react.md)
- [On-demand SPFx library facades with top-level await](../decisions/on-demand-library-facades.md)

## Evidence

- Source: user docs, migration guide, top-level-await externals research, implementation behavior (webpack-like external imports) (verified live with a 1.24.1 project on a tenant serving 1.25.0), implementation behavior (externals component, project model)
- Confidence: high
- Last checked: 2026-11-19
