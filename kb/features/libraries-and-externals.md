---
title: SPFx libraries and config.json externals
type: feature
status: current
tags:
  - project-kb
  - externals
  - spfx-libraries
  - manifests
---

# SPFx libraries and config.json externals

## Summary

SPFx libraries and `config/config.json` `externals` are AMD externals of the bundles, exactly as in heft's output: the bundle declares them on its `define`, sp-loader loads them through the component manifest, and imports read names from the loaded module at runtime. The debug manifest lists, per bundle, only the libraries and externals the bundle really uses, in heft's format. Local-file externals are served next to the bundles. Edits that change a bundle's external list, or edit a local-file external, reload the page.

## Behavior

### SPFx libraries

- Every dependency (walked transitively) that ships an SPFx library manifest, plus `@microsoft/microsoft-graph-client`, is an external by exact request: all `@microsoft/sp-*` libraries, `@microsoft/sp-adaptive-card-extension-base`, and third-party library components. React stays bundled (development build, see [Rspack compile](rspack-compile.md)). A library component project linked into the project (real path outside `node_modules`) is not an external: it is compiled from source ([local library projects](local-library-projects.md)).
- `scriptResources` gets `{ type: 'component', id, version }` (the installed library's id and version) for each library the bundle uses, including libraries used only in lazy `import()` chunks (Rspack hoists them onto the entry `define`), plus `@microsoft/sp-loader`. The tenant serves the highest version with the same major (a 1.24.1 project on a 1.25 tenant works).
- **Deep imports** into a library (`@microsoft/sp-core-library/lib/Version`) are bundled from `node_modules`, like heft (its externals match exact requests only); the deep file's own imports of libraries stay externals and are listed. fast-serve warns only when project code makes the deep import (a file under the project root, outside any `node_modules`, compared by real path so pnpm and linked packages count as dependencies); deep imports made by dependencies are bundled silently, like heft, because the user can't change them. The warning names the importing file project-relative (`src/webparts/x/X.tsx imports "<library>/lib/…", a deep import into the SPFx library <library>: it is bundled as a separate copy, not the instance SharePoint loads; import from "<library>" instead`), one line per request with the first importer and a count of the others; the same line is not repeated on rebuilds, a changed importer list prints again. Mapping deep imports to the library's root module was tried and rejected: the root does not re-export everything a deep module exports (a deep default import became `undefined`).

### `config.json` externals

- Entries: a URL or path string, or `{ "path", "globalName"?, "globalDependencies"? }`; validated by the [project model](../architecture/project-model.md) (missing file, bad shape, invalid/circular global dependency, name of an SPFx library → warning, entry skipped).
- Each valid entry is an AMD external by exact name. Manifest entry like heft: `{ type: 'path', path, globalName?, globalDependencies? }`, listed only for bundles that import the external, plus the externals named in its `globalDependencies` (transitively). URLs are listed as is; a local file is listed as the relative path `<name><extension>` and served from the bundle base URL (`/dist/<name>.js`, from memory, with the CORS headers). `globalName` makes sp-loader shim a non-AMD script.
- Import semantics are webpack's, measured on Rspack:
  - `import { render } from 'ejs'` reads `render` from the loaded module when used;
  - `import * as ejs from 'ejs'` and `require('ejs')` are the module as RequireJS returned it (a function stays callable);
  - `import ApexCharts from 'apexcharts'` is `module.default` when the module has `__esModule`, otherwise the module (for a `globalName` shim: the global itself);
  - `export { render } from 'ejs'`, `export * as ejs from 'ejs'` and also `export * from 'ejs'` (names copied at runtime) work.
- A CDN external needs the tenant's CSP to allow the host (same with heft); local files are served from `localhost` and allowed with the debug query.

### Edits during a session

| Edit | Result |
|---|---|
| a module starts or stops importing a library or external (the bundle's external list changes) | page reload: the AMD `define` list is fixed when the bundle loads, so a hot update cannot supply a new external (it would fail with "`__rspack_external_…` is not defined") |
| a local-file external | page reload with the new file |
| imports of libraries/externals the bundle already declares | normal hot update |
| a syntax error, then its fix, in the only module that imports a library/external | error overlay, then normal hot updates (state kept); the external keeps its binding |

## Implementation Notes

- After every successful compile the external modules of each entry's chunks (and their async chunks) are collected per bundle; manifests are rendered from that list. When a rebuild changes any bundle's list, the dev server tells the pages to reload before the update is announced, so the broken hot update is never applied (checked live: no console error).
- A module with a build error has no dependencies, so an external used only by that module leaves the chunk during the failed build. The hot update of the fixed build then ships the external module again, with a factory that reads the `define` parameter (`__rspack_external_…`) from the hot-update file, where it doesn't exist: the update throws "is not defined", Fast Refresh keeps the old component, and the cached external module stays an empty object, so the next edit fails with "`escape` is not a function". The failed build doesn't count as an external-list change (no reload on errors), and the fixed build's list equals the last good one, so no reload happens either. Fix: each bundle's hot-update handler remembers the factories of its configured externals (libraries and `config.json` externals) as they were when the bundle loaded and puts those back in place of any external factory a hot update ships. The handler copies the update before replacing, because the same update object is handed to every bundle on the page. The list is fixed per session, so the runtime code doesn't change between builds (a runtime that changes is re-sent and re-run inside the next hot update). Bundled npm packages are not affected (their factories don't depend on the bundle's closure).
- Local-file externals are emitted as compilation assets and added to the watched files; their change triggers the same page reload.

## Links

- [Externals semantics](../concepts/externals-semantics.md)
- [Component manifests and the SharePoint loader](../concepts/component-manifests-and-loader.md)
- [Dev server, debug manifests and debug URL](dev-server.md)
- [HMR and React Fast Refresh](hmr.md)
- [Localized strings](localization.md)
- [Local library component projects](local-library-projects.md)

## Evidence

- Source: implementation behavior (integration test with a real dev server and a fake RequireJS page: libraries, deep import from project code warned with the importer, deep import from a dependency bundled silently, lazy-chunk library, URL/local/global-dependency externals, named/namespace/default/`export *`/`require` semantics, served local files, reload on external-list change and local-file edit); heft's externals and `LegacyExternals` sources for the manifest format.
- Live (SPFx 1.24.1 project on a tenant serving 1.25): local copies of ejs (`render` named import), apexcharts AMD build with `globalName` (default import) and a non-AMD global with a global dependency rendered in a web part; editing the local external reloaded with the new text; adding a deep default import hot-updated; adding a new library import (`@microsoft/sp-http`, `@microsoft/sp-http-base`) reloaded cleanly. Manifests compared with heft's `dist/` for both test projects: same libraries and versions except the known `@microsoft/sp-loader` entry and the ACE's async-loader difference.
- Local (2026-11-20, `1.24.0-rspack.13`, spfx-bench copy): no deep-import warning at start, also with a local dependency that deep-imports `@microsoft/microsoft-graph-client/lib/es/src/middleware/MiddlewareUtil` (bundled); adding the same deep import to a web part component printed the warning naming that component on the rebuild.
- Confidence: high
- Last checked: 2026-11-20
