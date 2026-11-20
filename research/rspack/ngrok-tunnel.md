# Research: tunnel (ngrok) support for the Rspack line

Status 2026-11-20, against `1.24.0-rspack.17`. Research only: nothing in `src/` changed. Prototype files are in `/var/tmp/ngrok-research/`.

## TL;DR

- **The classic recipe was never "a tunnel URL in the debug query".** Classic fast-serve (`NgrokServePlugin`, added 2021, helpers ≤ 1.21) only rewrote the webpack public path and the dev-server public host. The SharePoint side came from a **dev (non-`--ship`) package deployed to the app catalog**, built with `config/serve.json` `hostname: <ngrok host>`, `port: 443`. The deployed manifests pointed `internalModuleBaseUrls` at the tunnel, so Viva/Teams mobile (where no debug query is possible) loaded the bundles from the developer's machine.
- **The debug query cannot point to a tunnel.** sp-loader 1.24.1 only accepts `debugManifestsFile` (and `loader`/`moduleLoader`) on `localhost`/`127.0.0.1` for third parties (`_isLocalhostUrl`, details below). SharePoint's CSP, enforced since March 2026, also only allows `localhost:*` scripts together with the debug query. So "start a tunnel, put its URL in the printed page URL" doesn't work. Any tunnel feature has to follow the classic deployed-package route.
- **The dev-server half is easy in the Rspack line.** Every URL comes from `options.origin`. The one exception is the HMR WebSocket URL, which is hardcoded in `devServerConfiguration`. A 2-line patch in the prototype (origin from an env var, WebSocket host from it) served `manifests.js`, the bundle, the hot-update files and the HMR WebSocket through a public tunnel. An edit hot-updated over the tunnel.
- **The SharePoint half is the real work.** We need a deployable package whose manifests are **ours** (not heft's), with the tunnel as the base URL. Heft's non-production `package-solution` packs whatever `*.manifest.json` sits in `dist/`, so we can reuse it. The prototype built such a `.sppkg` from fast-serve's own manifests. It was not deployed: the task rules forbid tenant changes.
- **Verdict:** possible, medium effort (M) for a generic `publicUrl` plus a tunnel-package command, plus an optional built-in `ngrok` provider (S on top). The classic approach can't be reused as is: heft's dev package doesn't match our bundles (loc files 404), and free ngrok's interstitial breaks `<script>` loads.

## 1. How classic fast-serve did it

Sources: `spfx-fast-serve/docs/NgrokServe.md` and README, plus helpers `src/plugins/NgrokServePlugin.ts`, `src/plugins/common/ClearCache.ts` and `src/common/types.ts` at `74e86fa` (the last webpack-era commit; the plugin came in `d5e0480` "Added ngrok host plugin", Oct 2021).

- **Package/plugin:** no ngrok npm dependency at all. The user ran the ngrok **binary** (`ngrok http https://localhost:4321`) and passed the host to `new NgrokServePlugin({ host })` in `fast-serve/webpack.extend.js`. There was no `fast-serve/config.json` option (no `ngrokServe`, domain, token or region option). `NgrokServeOptions` was `{ host: string }` only.
- **What the plugin changed:**
  - `output.publicPath = https://<host>/dist/`, so chunks and assets load through the tunnel.
  - `devServer.public = <host>`. This is a webpack-dev-server **v3** option. Helpers 1.21 ran wds 5.0.4, where `public` no longer exists, so in the last classic versions the live-reload socket URL was probably *not* redirected (inferred from the code, not tested). `allowedHosts: 'all'` was already in the base config, and HMR was off (`hot: false`, live reload only).
  - It prepended `ClearCache.js` to every entry. That script deletes Cache Storage entries (`Site-*` caches) whose URL contains the tunnel host, because the Viva/Teams mobile apps cache bundle responses.
- **Manifests:** fast-serve did not generate them. The user set `config/serve.json` `hostname: <ngrok host>` and `port: 443`, ran `gulp bundle` + `gulp package-solution` (no `--ship`) and deployed the package tenant-wide. SPFx then wrote `https://<host>:443/dist/` as `internalModuleBaseUrls` into the packaged manifests. No `debugManifestsFile` query was used: components load as if deployed.
- **Use cases:** ACEs in the Viva Connections dashboard on the mobile app, Teams tabs on mobile, device-only bugs.
- **Limitations:** the random ngrok URL changed on every restart (free plan at the time), which meant a rebuild and redeploy each time. The dev package replaces the real app in the catalog. The steps were manual (serve.json edit, extend file, package, deploy). Live reload only.

## 2. The ecosystem in Nov 2026

- **`@ngrok/ngrok`** (official Node SDK, Rust/napi, no binary, 1.5.x, maintained): `ngrok.forward({ addr: 'https://localhost:4450', authtoken_from_env: true, domain?, verify_upstream_tls: false, compression? })` returns a listener with `url()` and `close()`, and `ngrok.disconnect()`/`kill()` stop it. `authtoken_from_env` reads `NGROK_AUTHTOKEN`. The ngrok docs say the agent does not verify the upstream certificate by default, so the SPFx dev cert works upstream. The old `ngrok` npm wrapper (downloads the binary) is legacy. Prefer the SDK if we embed anything.
- **Free plan** (ngrok docs): one static dev domain per account (`*.ngrok-free.dev`/`.app`, stable across restarts, can't be renamed), up to 3 endpoints, **1 GB/month transfer, 20,000 HTTP requests/month**, 4,000 requests/min.
- **Interstitial (ERR_NGROK_6024):** free endpoints put a warning page in front of browser traffic. Third-party tests (LocalCan, Nov 2026) show it is decided by the browser User-Agent on **GET**, so it hits a `/logo.png` the same way. `POST`/`OPTIONS` pass. The bypass is the `ngrok-skip-browser-warning` request header (or a non-browser UA), or a cookie set after clicking "Visit" (7 days, per browser). **`<script>` tags injected by RequireJS can't send headers**, so on the free plan bundle loads from a SharePoint page get HTML instead of JS. The cookie route needs a top-level visit in the *same* browser/webview, plus a cross-site cookie on the script request. That is impractical in Teams/Viva mobile and blocked by Safari/iOS third-party cookie rules (inferred). **A paid ngrok plan (no interstitial) is effectively required.** A traffic policy can't remove it on free.
- **Alternatives:**
  - Cloudflare **quick tunnel** (`cloudflared tunnel --url https://localhost:4450 --no-tls-verify`): no account, no interstitial, WebSockets work, at most 200 in-flight requests. The hostname is random on every start, which means a redeploy per start. A named Cloudflare Tunnel (free account + own domain) gives a stable host.
  - **Microsoft Dev Tunnels** (`devtunnel host -p 4450 --protocol https --allow-anonymous`): persistent tunnel IDs. The anti-phishing page is skipped when the request isn't GET **or Accept doesn't contain `text/html`**, so script requests (`Accept: */*`) pass. Anonymous access is needed for SharePoint script loads. Natural for M365 developers.
  - localtunnel: unmaintained-ish, has its own reminder page. Not recommended.
- **A generic `publicUrl` option covers all of them.** The server only needs the public origin. The tunnel process can be anything the user runs.

## 3. What it takes in the Rspack line

### Where the origin is used (rspack.17)

| Place | Source | Follows `options.origin`? |
|---|---|---|
| `options.origin` (`https://localhost:${port}`) | `config/options.ts` | the single source |
| `output.publicPath` (`<origin>/dist/`): chunks, assets, hot-update files | `rspack/config.ts` via `featureApi/urls.publicPath` | yes |
| manifests `internalModuleBaseUrls`, dev icon URLs | `manifests/index.ts`, `iconUrls.ts` | yes |
| page runtime (`installedKey`, `reportUrl` → `/fast-serve/browser-errors`, dist URL for source maps) | `browserErrors/index.ts` | yes |
| local-file `config.json` externals | relative `path` resolved against `internalModuleBaseUrls` | yes (indirect) |
| banner / `open:` URL / debug query, restart banner, `debugUrlInputs` | `server/readyBanner.ts`, `debugUrl.ts`, `session/devSession.ts` | yes, but the debug query with a non-localhost origin is useless (sp-loader) |
| extend-file context `origin`/`publicPath` | `extend/index.ts` | yes |
| **HMR WebSocket** `client.webSocketURL: { protocol: 'wss', hostname: 'localhost', port }` | `server/devServer.ts` | **no, hardcoded** |
| `host: 'localhost'` listen address, `allowedHosts: 'all'` | `server/devServer.ts` | listen stays local (the tunnel connects to localhost). `allowedHosts: 'all'` already accepts the tunnel Host header |
| CORS `*` + `Access-Control-Allow-Private-Network` | `featureApi/http.ts` | fine through a tunnel (public origin, so no LNA prompt) |
| certificate | `server/certificate.ts` | unchanged: the tunnel terminates public TLS and talks to the dev cert upstream without verification |

So the server side needs one new resolved field (public origin, default `https://localhost:<port>`) used everywhere `origin` is used today, plus a WebSocket URL derived from it (`wss://<public host>:443/ws`).

### Lifecycle

- **Restarts:** `devSession` rebuilds the server per generation (config/extend changes). The tunnel has to be owned by the session, not the generation: start it before the first `prepareGeneration`, put its URL into the options, and keep it across restarts. With ngrok's static dev domain or a named devtunnel, the URL is also stable across fast-serve runs, which matters because the deployed package hardcodes it.
- **Ctrl+C:** `shutdown.ts` must call `listener.close()`/`ngrok.disconnect()` after `session.close()`. The SDK runs in-process, so process exit also drops it.
- **Port:** the tunnel forwards to `https://localhost:<port>`, so `assertPortFree` is unchanged.

### `document.currentScript` public path: relevant

With a baked `publicPath` (today), one server can only use one origin. In tunnel mode we want both:
- the desktop debug-query flow from `https://localhost:<port>/temp/build/manifests.js`, where CSP allows only localhost;
- the deployed package (mobile/Teams), which loads from the tunnel.

If the bundle's localhost manifests list tunnel base URLs, the desktop page needs the tunnel host in the tenant's Trusted Script Sources. A runtime public path from `document.currentScript` (heft's `SetPublicPathCurrentScriptPlugin` idea, rspfx does it) makes chunks, assets and hot-update files follow whichever host loaded the bundle. Then one server serves both flows and the manifests only differ in `internalModuleBaseUrls`.

The HMR socket would need the same treatment. The dev-server client takes its URL from the compile-time `__resourceQuery`, and only falls back to the *last `<script>` on the page* when there is none (unreliable inside SharePoint). The clean hook is a custom `client.webSocketTransport` that takes the host from the origin captured at the top of the bundle. Not prototyped.

Without currentScript, a tunnel session simply uses the tunnel origin everywhere (what the prototype did).

### The SharePoint side: package with our manifests

- sp-loader 1.24.1 (`@microsoft/sp-loader` npm package, module `3549`): in `_handleNonTestModeDebugParameters`, unless killswitch `c50616e7-…` is active or the internal debug flight is on (Microsoft), a `debugManifestsFile` is used only if `_isLocalhostUrl()` (`localhost` or `127.0.0.1`, http/https). Otherwise it falls back to a previously stored localhost URL ("Error loading non-localhost debugManifestsFile…"). `_is3PDebugEnabled` applies the same check to `loader`/`moduleLoader`. This is inferred from the shipped code. It was not checked live: the shared browser profile was in use by another task the whole time. The tenant serves its own sp-loader build, which may differ.
- **Heft's dev package alone doesn't fit our bundles.** `heft build` (no `--production`) with `serve.json` `hostname/port` writes `https://<host>:443/dist/` into `dist/*.manifest.json` (`WebpackConfigurationGenerator` `debugBaseUrl`, still in 1.24), and `heft package-solution` without `--production` packs those. Entry file names and export names match ours (`hello-world-web-part.js`, export `a`), and our AMD dependencies are a subset of heft's. But heft lists localized strings as `type: path` resources (`HelloWorldWebPartStrings_en-us.js`), which our server answers with **404**, so the component would fail. Every manifest change also needs a heft build.
- **What works instead:** write fast-serve's own debug manifests (base URL = public origin) as `dist/<id>.manifest.json`, then run `heft package-solution` (non-production reads manifests from `dist/`). The prototype did exactly this: the `.sppkg` contains our `scriptResources` and `internalModuleBaseUrls: ["https://<tunnel>/dist/"]` for all 7 components.
  - The package must be redeployed when the manifests change (new component, new external, changed `config.json`), not on code edits.
  - It overwrites heft's `dist/*.manifest.json`, so it needs a clean prod build afterwards.
  - It replaces the real app in the catalog, as in classic. A separate solution id/name for the dev package would avoid clobbering a real deployment, but then component ids clash; that needs a decision.
- **Page runtime:** today the error overlay / browser-error forwarding is prepended to `manifests.js`. A deployed package never loads `manifests.js`, so in tunnel mode that runtime has to move into the bundle entry, or it silently disappears (HMR still works, since the HMR client is in the bundle).
- **CSP:** for packages with an external `cdnBasePath`, SharePoint auto-adds the base URL to Trusted Script Sources when the app is enabled (Microsoft docs). Our dev package's `internalModuleBaseUrls` is the same field, so it's very likely auto-added too (inferred). If not, an admin adds the tunnel origin by hand (exact host; wildcards like `*.ngrok-free.dev` are not allowed). Hot-update scripts come from the same origin, so they are covered as well.
- **Mobile caching:** classic needed `ClearCache` for Viva/Teams mobile. Our bundles have no `Cache-Control: no-store` today (only hot updates and `manifests.js` do). Tunnel mode should send `no-store` on `/dist/*`, and maybe port the cache-busting runtime.

## 4. Prototype

`NGROK_AUTHTOKEN` is **not** set in this environment, and no ngrok/cloudflared/devtunnel binary was installed. Per the task rules I didn't sign up for ngrok. Instead I used a **Cloudflare quick tunnel** (no account; `cloudflared` 2026.11.1 downloaded into the prototype folder). The fast-serve side is identical for any provider.

Setup:
- `cp -a /home/sergei/Projects/spfx-rea /var/tmp/ngrok-research/rea`;
- installed `spfx-fast-serve-helpers-1.24.0-rspack.17.tgz`;
- patched the installed `lib/config/options.js` to `origin: process.env.FS_PUBLIC_ORIGIN ?? https://localhost:${port}`;
- patched `lib/server/devServer.js` so that `webSocketURL` = `{ wss, <public host>, 443 }` when the env var is set.

Commands: `cloudflared tunnel --url https://localhost:4450 --no-tls-verify`, then `FS_PUBLIC_ORIGIN=https://<x>.trycloudflare.com fast-serve --port 4450`.

Results (curl with a Chrome User-Agent, through the tunnel):
- banner: `ready in 1720 ms at https://<x>.trycloudflare.com`, and the printed debug query used the tunnel URL. That query is useless because of sp-loader, as expected.
- `GET /temp/build/manifests.js` returned 200 (25.6 KB, 0.22 s). All 8 `internalModuleBaseUrls` and the browser-errors URL point to the tunnel; no `localhost` left.
- `GET /dist/hello-world-web-part.js` returned 200 (1.33 MB, 0.15 s; 297 KB with gzip from Cloudflare's edge, our server doesn't compress). The baked public path in the bundle was `https://<x>.trycloudflare.com/dist/`, and the CORS headers passed through.
- HMR WebSocket `wss://<x>.trycloudflare.com/ws` with `Origin: https://<tenant>.sharepoint.com`: open in 147 ms, then `hot`/`liveReload`/`hash`/`ok`. After an edit to `HelloWorld.tsx`: `invalid` → `hash` → `ok` about 85 ms later (`rebuilt in 78 ms`). The hot-update manifest `hello-world-web-part.<hash>.hot-update.json` loaded through the tunnel (200, `no-store`).
- Tunnel package:
  - `serve.json` hostname/port + `heft build` + `heft package-solution` gave a `.sppkg` pointing to `https://<x>.trycloudflare.com:443/dist/`. heft's string resources `HelloWorldWebPartStrings_en-us.js` returned **404** from fast-serve.
  - With fast-serve's manifests written to `dist/` + `heft package-solution`, the `.sppkg` carries our manifests with the tunnel base URL.
- **Not done:**
  - live SharePoint checks. The browser profile was busy with another task's Chrome (one Chrome per profile), and a deployed-package test needs an app-catalog deployment (not allowed: view only). So "renders and hot-updates in SharePoint through a tunnel" is unverified;
  - the sp-loader localhost rule is from code reading only;
  - ngrok itself: no token, so the interstitial behaviour comes from the docs and third-party tests.

Note: a first attempt failed with Cloudflare 530 because the background `cloudflared` died with the tool's shell. It works with `setsid nohup`.

## 5. Recommendation

**Possible: yes. Difficult: medium.** The server part is small. The cost is the package flow, docs, and the tenant-side steps we can't automate (deploying the package, maybe trusting the host).

Proposed design:
1. **`publicUrl`** (`fast-serve/config.json` / `--public-url`, env `FAST_SERVE_PUBLIC_URL`). The value must be an `https` origin, normalized without a trailing slash. It sets the public origin used for `publicPath`, manifests, the page runtime, extend context `origin`/`publicPath`, the banner, plus `client.webSocketURL` = `wss://<host>:<port or 443>/ws` and `Cache-Control: no-store` on `/dist/*`. Works with any tunnel the user runs (ngrok paid, devtunnel, cloudflared, a reverse proxy). Effort **S**.
2. **`tunnel: "ngrok"`** (optional built-in provider). It needs `@ngrok/ngrok` as an **optional peer** loaded with dynamic `import()` (not a dependency: native binaries, 10+ MB), a token from `NGROK_AUTHTOKEN` (never from config.json), and an optional `tunnelDomain`. The session starts it before the first generation, keeps it across restarts and closes it on shutdown. It prints a warning that free plans show an interstitial that breaks script loading. Effort **S** (on top of 1). `devtunnel`/`cloudflared` could follow as spawn-based providers, but `publicUrl` already covers them.
3. **`fast-serve package`** (or `--package`): writes our current debug manifests with the public base URL to `dist/`, runs `heft package-solution` (non-production) and prints which `.sppkg` to deploy and when to redeploy (manifest changes). It also detects manifest drift at startup (hash of the manifests stored next to the package) and warns. Effort **M**.
4. **Move the page runtime into the bundle entry** when `publicUrl` is set, so the overlay and error forwarding work without `manifests.js`. Effort **S–M**.
5. Optional, later: **currentScript-relative public path + WebSocket transport** so that localhost debug-query sessions and tunnel sessions work against the same server at once. Effort **M**; needs a live check that `document.currentScript` is set when RequireJS evaluates our AMD bundle (heft relies on it, so likely yes).

Total for 1–4: **M**.

Risks:
- **Free ngrok is effectively unusable:** the interstitial on script GETs, plus 1 GB/month (one page load is about 1.3 MB per bundle uncompressed; our server doesn't compress, so enabling `compression` in the tunnel or in our server matters) and 20k requests/month. Recommend a paid ngrok plan, Dev Tunnels, or a named Cloudflare Tunnel.
- **Security:** the dev server becomes public. That exposes source, source maps, `/fast-serve/browser-errors` (POST) and CORS `*`, and it serves executable code to whoever has the package deployed. Mitigations:
  - an unguessable or authenticated tunnel (devtunnel `--tenant` access can't be used for script loads from SharePoint, which carry no tunnel auth);
  - narrowing CORS to `*.sharepoint.com`/Teams origins in tunnel mode;
  - short sessions;
  - never deploying the dev package to a production tenant catalog.
- **Tenant changes:** the developer needs app-catalog rights. The dev package replaces the real app. Trusted Script Sources may need the tunnel host (exact host only).
- **Latency:** each page load and HMR update goes through the tunnel edge. Rspack's 3 requests per page are fine. The prototype measured 0.15–0.22 s per request over Cloudflare.
- **URL stability:** a random URL (quick tunnels, ngrok without a dev domain) means a repackage and redeploy per run. Push static domains.
- **sp-loader/CSP rules are Microsoft-controlled** and could tighten further for dev packages.

### Same for the Vite line?

The same sp-loader/CSP constraint applies: no tunnel in the debug query, a deployed package is required. The server part maps to `server.origin` + `server.hmr.{host,clientPort,protocol}` + allowed hosts. But the Vite line serves an unbundled ESM graph: hundreds to 1000+ requests per page (1180 on the 1000-module benchmark). Through a tunnel that means high latency per page, the 200 in-flight cap on quick tunnels, and the 20k requests/month free ngrok quota gone in a few dozen loads. Tunnel support is a much better fit for the Rspack line. For Vite it's possible but only reasonable for small projects.
