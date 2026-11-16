# spfx-fast-serve-helpers

> **Work in progress.** Vite-based rewrite for SharePoint Framework **1.24.x** (Heft) projects.

A dev-server-only replacement for `heft start`: the server starts fast, HMR with React Fast Refresh works, and your web part runs inside a real SharePoint page. Production builds and packaging stay on Heft (`heft build` / `heft package-solution`).

Design notes, decisions and status: [docs/vite/HANDOFF.md](docs/vite/HANDOFF.md).

## Requirements

- An SPFx **1.24.x** project (`@microsoft/sp-core-library` `>=1.24.0 <1.25.0`). The package version follows the SPFx version, as in the classic spfx-fast-serve: `spfx-fast-serve-helpers@~1.24.0` serves SPFx 1.24.x. For SPFx up to 1.21 (gulp/webpack), use [spfx-fast-serve](https://github.com/s-KaiNet/spfx-fast-serve) with the matching `spfx-fast-serve-helpers@~1.21.0` (or earlier). SPFx 1.22 and 1.23 are not supported. `fast-serve` checks the installed SPFx version at start and exits with a message if it doesn't match.
- Node.js versions supported by SPFx 1.24: 22 (from 22.14), 24 or 26.
- The SPFx development certificate, trusted once per machine (the same one `heft start` uses).

## Install

```sh
npm install --save-dev spfx-fast-serve-helpers@~1.24.0     # or: pnpm add -D spfx-fast-serve-helpers@~1.24.0
npx heft trust-dev-cert                                    # once per machine
```

It installs with plain `npm install`, no `--legacy-peer-deps`, next to SPFx's default Jest/Babel 7 dependencies. Vite and `@vitejs/plugin-react` are regular dependencies of this package, so you don't need to add them to your project. React and react-dom always come from your project's `node_modules`, in their development build (Fast Refresh needs it).

Add a script to `package.json`:

```jsonc
"scripts": {
  "serve": "fast-serve"
}
```

## Usage

```sh
npm run serve
```

It prints the page to open, e.g.

```
[fast-serve] ready in 340 ms at https://localhost:4321
[fast-serve] web parts: HelloWorldWebPart
[fast-serve] open: https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true
```

Open that URL and click **Load debug scripts**. If no page is configured, append the printed query to any SharePoint page URL: `?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true`. The web part must already be on the page (add it from the toolbox while `fast-serve` runs, then save the page).

Only web parts are supported for now. Stop the server with Ctrl+C.

### Options

Zero config works. Options, by precedence:

1. command-line flags: `fast-serve --port 4400 --page-url https://contoso.sharepoint.com/sites/dev/SitePages/test.aspx --locale de-de`
2. `config/fast-serve.json` (optional, JSON with comments):
   ```json
   { "port": 4321, "pageUrl": "https://{tenantDomain}/sites/dev/SitePages/test.aspx", "locale": "en-us" }
   ```
3. SPFx defaults: `config/serve.json` `port` and `initialPage`, then port `4321` and locale `en-us`.

| Option | Flag | Meaning |
|---|---|---|
| `port` | `-p, --port` | HTTPS port on `localhost` |
| `pageUrl` | `--page-url` | page printed with the debug query. `{tenantDomain}` is replaced with the `SPFX_SERVE_TENANT_DOMAIN` environment variable (e.g. `contoso.sharepoint.com`) |
| `locale` | `--locale` | locale of `localizedResources` strings (falls back to `en-us` per resource) |

HTTPS is always on, with the SPFx development certificate. There is no `vite.config` to write: `fast-serve` configures Vite itself.

### TypeScript paths, static assets and theme colors

- **`paths` aliases.** `compilerOptions.paths` and `baseUrl` in `tsconfig.json` (including the files it `extends`) resolve imports in `src` the way `tsc` does: exact keys first, then the longest matching wildcard, targets in order, then `baseUrl`, then `node_modules`. Editing `tsconfig.json` (or a file it extends inside the project) reloads the page with the new aliases.
- **Static assets.** `import logo from './assets/logo.png'` (or `require('./assets/logo.png')`) gives an absolute URL on the dev server, e.g. `https://localhost:4321/src/webparts/hello/assets/logo.png`. Typings come from the SPFx build rig: Heft's `static-asset-typings` task writes `temp/static-asset-ts/**/*.d.ts` for the extensions in the rig's `config/static-asset-typings.json` (`.gif`, `.jpg`, `.jpeg`, `.png`, `.svg`, `.webp`), and the rig's `tsconfig` reads them through `rootDirs`. `fast-serve` writes the same files when it starts and when you add an asset, so new assets are typed without a `heft build`. For other extensions (e.g. `.woff`, `.mp4`) add your own declaration, exactly as `heft build` needs it:
  ```ts
  declare module '*.mp4' {
    const url: string;
    export default url;
  }
  ```
  TypeScript finds these typings for relative imports only (through `rootDirs`). To type assets imported through a `paths` alias, add the typings folder as a second target; `fast-serve` uses the first target that exists:
  ```json
  "paths": { "@assets/*": ["./src/assets/*", "./temp/static-asset-ts/assets/*"] }
  ```
- **Theme colors.** `"[theme:themePrimary, default: #0078d4]"` tokens in your styles resolve to the page theme when a stylesheet is inserted or hot-updated. Switching the site theme while the page is open does not recolor them: reload the page.

## HMR: do's and don'ts

What updates in place, keeping React state:

- function components in `.tsx` files that export only components;
- `.module.scss` / `.scss` edits;
- new imports, including new `@microsoft/sp-*` packages.

What reloads the page (by design):

- edits to the web part class (`*WebPart.ts`) and to anything only the web part class imports (services, helpers);
- edits to files that export components **and** other values such as constants or hooks (type-only exports are fine): Fast Refresh skips them, the update bubbles up and ends in a reload. Keep components in component-only files;
- edits to `config/config.json`, `config/serve.json`, `package.json`, `tsconfig.json` or a web part manifest.

Watch out:

- module-level side effects (`initializeIcons()`, PnPjs `spfi()` singletons, global listeners) run again on every hot update of that module. Do setup in `onInit` of the web part instead;
- class components are re-mounted (state lost) on update; prefer function components;
- in dev, all bundles share one module graph (one instance of each module). In production each bundle has its own copy, so don't rely on shared module state between bundles;
- React is the development build from your project, while production uses the React that SharePoint ships.

## Troubleshooting

| Symptom | What to do |
|---|---|
| `No valid SPFx development certificate found` | run `npx heft trust-dev-cert` in the project |
| "Error loading debug manifests" on the page | `fast-serve` isn't running, or the browser doesn't trust the certificate (`npx heft trust-dev-cert`, then restart the browser). Chrome/Edge may also ask to allow access to local network devices: allow it |
| "Error loading debug manifests" after you stopped `fast-serve` | the debug query sticks to the browser tab (`sessionStorage`). Open the page in a new tab, without the query |
| `Port 4321 is already in use` | another `fast-serve` or `heft start` is running. Stop it, or use `--port` / `"port"` |
| `Unsupported SPFx version` | install the `spfx-fast-serve-helpers` version matching your SPFx version (see Requirements) |
| `No web parts found` | only web parts are served for now; check `config/config.json` bundles |
| web part shows `[fast-serve] Failed to load bundle …: <error> in src/…:line:col` | a syntax or transform error: details are in the `fast-serve` terminal. Fix the file and the page reloads |
| `… older than … used by the project` | your project uses a newer SPFx version than your tenant serves. It would fail in production too: use the SPFx version your tenant supports |

## Limitations (v1)

- Web parts only: no extensions (Application Customizers, Command Sets, Field/Form Customizers), Adaptive Card Extensions or library components yet.
- Dev server only: no production build, no type checking and no linting (run `tsc --noEmit` / ESLint / `heft build` separately).
- No error overlay; errors show in the web part, the browser console and the terminal.
- `config/config.json` `externals` are not supported yet.
- `localhost` only (no tunnels, containers or WSL-specific setup); no Teams hosts.
- The page is loaded from `localhost` module by module, so a cold page load of a very large project is slower than `heft start`; edits are much faster.

## Development

```sh
pnpm install
pnpm build      # compile to lib/ with TypeScript 7 (Node code + lib/runtime browser code)
pnpm dev        # watch build (Node code)
pnpm lint       # oxlint with type-aware rules (oxlint-tsgolint), config in .oxlintrc.json
pnpm typecheck
pnpm test
```

Source layout: [src/README.md](src/README.md).

## License

MIT
