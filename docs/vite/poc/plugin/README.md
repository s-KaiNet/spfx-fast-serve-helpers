# vite-plugin-spfx-serve

A Vite dev server for SPFx web parts, used **only for development**: `npm run serve`. It replaces `heft start`.
Production builds and packaging still use Heft (`npm run build`).

You get a fast start, because Vite doesn't bundle up front, and real HMR: React Fast Refresh keeps component state, and CSS updates without a page reload.

## Usage

```bash
npm run serve
# open the URL it prints (page + ?debugManifestsFile=…&debug=true&noredir=true) and accept "Load debug scripts"
```

Options (in `vite.config.mjs`):
- `pageUrl`: the page printed with the debug query string. The `SPFX_SERVE_PAGE` env variable overrides it.
- `locale`: the locale for `localizedResources` (default `en-us`).
- `port`: defaults to `config/serve.json` `port` (4321).

The server uses the SPFx dev certificate in `~/.rushstack` (`npx heft trust-dev-cert`).

## How it works

1. `GET /temp/build/manifests.js`: debug manifests generated from:
   - `config/config.json` (bundles, components, `localizedResources`);
   - the source `*.manifest.json` files (`"*"` version → `package.json`);
   - the SPFx libraries in `dependencies` that `src/` imports (Library manifests in `node_modules/<pkg>/dist`).
2. `GET /@spfx/component/<id>.js`: an ordinary (non-module) script that registers `<id>_<version>` with SharePoint's RequireJS. Its loader plugin:
   - loads the `@microsoft/sp-*` externals through the component's own RequireJS, so you get the tenant's versions;
   - `import()`s the web part entry from Vite.
3. In Vite, `@microsoft/sp-*` imports become small modules that re-export what step 2 loaded. `*Strings` imports become modules built from the `loc/<locale>.js` file.
4. **React is not taken from the page in dev.** SharePoint ships production React, which can't do Fast Refresh, so the web part uses the development React from `node_modules`. The Fast Refresh preamble runs first in the entry.
5. **Theme tokens** (`"[theme:bodyText, default: #323130]"`) in CSS/SCSS are resolved from `window.__themeState__.theme`, the same source as `@microsoft/load-themed-styles` in production. Vite still owns the `<style>` elements, so CSS HMR updates them in place, and styles are re-resolved when the page theme changes.

## What updates how

| You edit | Result |
|---|---|
| a function component (`.tsx`) | Fast Refresh, state kept |
| `.module.scss` / `.scss` | styles swapped, the importing component is refreshed, state kept |
| the web part class, or a module no component accepts | full page reload |
| `loc/*.js`, `*.manifest.json`, `config/config.json`, `package.json` | full page reload |

Class components also hot-update, but they lose their state. Use function components.

## Limits (v1)

- Web parts only. Other component types are skipped with a warning.
- `config/config.json` `externals` (non-SPFx AMD/global libraries) aren't supported yet.
- A newly added import of an SPFx library needs one page reload, because the manifest has to list it.
- No type checking. Run `npx tsc --noEmit -p . --watch` alongside if you want it.
- The browser must trust the dev certificate and allow `localhost` access from the page (Chrome Local Network Access), same as `heft start`.
