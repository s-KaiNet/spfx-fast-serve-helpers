# spfx-fast-serve-helpers

> **Work in progress.** Vite-based rewrite for SharePoint Framework **1.24.x** (Heft) projects.

A dev-server-only replacement for `heft start`: fast start, true HMR with React Fast Refresh, and your web part runs inside a real SharePoint page. Production builds and packaging stay on Heft (`heft build` / `heft package-solution`).

Version follows the supported SPFx version (`1.24.x` → SPFx `>=1.24.0 <1.25.0`).

Design notes, decisions and status: [docs/vite/HANDOFF.md](docs/vite/HANDOFF.md).

## Usage

In an SPFx 1.24 project:

```sh
npm install --save-dev spfx-fast-serve-helpers
npx heft trust-dev-cert     # once per machine, same certificate as `heft start`
```

```jsonc
// package.json
"scripts": {
  "serve": "fast-serve"
}
```

`npm run serve` prints the SharePoint page URL with the debug query
(`?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true`). Open it and accept
"Load debug scripts".

Only web parts are supported for now.

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
| `pageUrl` | `--page-url` | page printed with the debug query. `{tenantDomain}` is replaced with the `SPFX_SERVE_TENANT_DOMAIN` environment variable |
| `locale` | `--locale` | locale of `localizedResources` strings (falls back to `en-us` per resource) |

HTTPS is always on, with the SPFx development certificate.

## Development

```sh
pnpm install
pnpm build      # compile to lib/ (Node code + lib/runtime browser code)
pnpm dev        # watch build (Node code)
pnpm lint
pnpm typecheck
pnpm test
```

Source layout: [src/README.md](src/README.md).

## License

MIT
