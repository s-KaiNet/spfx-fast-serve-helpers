# Final benchmark (R24): Rspack fast-serve vs Vite fast-serve vs `heft start`

Date: 2026-11-20. Packages: **Rspack fast-serve `1.24.0-rspack.11`** (this branch), **Vite fast-serve `1.24.0-beta.3`** (branch `v1.24`, packed unchanged), **`heft start`** (SPFx 1.24.1). Three generated projects with 100, 250 and 500 React components. Vite `bundledDev` was dropped from the scope. Raw results and the harness are in `/var/tmp/rspack-impl/bench-results/` (section 9).

## Short answer

- **Page load:** Rspack loads the page at heft's level at every size. Cold loads take 3.0–3.4 s (heft 3.1–3.2 s) and F5 2.1–2.3 s (heft 2.1–2.5 s), with **3 localhost requests**. Vite is already slower at 100 components (cold 4.5 s, F5 3.1 s, 192 requests). It gets about 0.47 s slower per 100 components, reaching 6.3 s / 4.4 s with 702 requests at 500.
- **Start:** Vite is ready in 0.8 s at every size. Rspack is ready in 1.8–2.3 s with an empty cache and 1.1–1.2 s with its persistent cache, which a normal second start uses. heft takes 13–19 s. **Start plus the first rendered page** is 4.8–5.7 s with Rspack and 5.2–7.1 s with Vite, so Rspack is ahead from 100 components even with an empty cache. heft takes 16–22 s.
- **Edits:** Vite is 3–5× faster: 29–55 ms against Rspack's 123–264 ms. Both keep React state (3/3 at every size) and never reload. heft never updated the DOM with two bundles on the page, at any size. It rebuilt in 0.5–1.0 s, the page fetched the hot update and nothing happened, so you need a manual F5 (2.4–3.1 s).
- **Memory:** Vite uses the least (0.14 GB at ready, 0.32–0.38 GB peak). Rspack peaks at 0.45–0.62 GB and heft at 0.90–1.16 GB.
- **Server CPU per cold page load:** Rspack 0.05–0.18 s, heft 0.2–1.1 s. Vite needs 1.4–3.4 s, because it transforms per request, and this grows with size.
- **Recommendation:** use Rspack fast-serve for projects from about 100 components or with Fluent/PnP-sized dependency trees. It matches heft on page loads and requests, the first page renders sooner after start, and HMR stays below 0.3 s with state kept. Vite is still the better inner loop (edits, memory, time to "ready") for small projects. Neither crossover point is above 100 components on this machine (section 8).

## 1. Method

| | |
|---|---|
| Machine | Intel i7-7500U (2 cores / 4 threads), 22 GB RAM, Linux 7.0.0-43, Node 24.21.0. VS Code was open during the runs (same for all servers) |
| Browser | agent-browser Chrome 153.0.8010.36 `--headless=new`, saved SharePoint profile, raw CDP. One tab: all other tabs are closed before each start |
| Page | `SitePages/spfx-bench.aspx` (SharePoint Online), BenchTree + BenchPnp web parts = **two bundles** on the page |
| Toolchain | Rspack line: `@rspack/core` 2.3.3, `@rspack/dev-server` 2.2.2. Vite line: Vite 8.3.8, Rolldown 1.2.19, `@vitejs/plugin-react` 6.3.0. heft 1.3.2, webpack 5.105.4 |
| Harness | the CDP harness from [research/rspack](README.md#1-setup-and-method) and [research/bundled-dev](../bundled-dev/README.md#4-q3-numbers), extended with a Rspack-line kind, cache modes, a React state probe and heft's hot-update/manual-F5 timing |
| Runs per cell | **3 starts**. Per start: 1 cold load (browser cache cleared) + 2 F5 = **3 cold, 6 F5**. In the last start: **3 edits per type** (leaf TSX, mid TSX, SCSS). Medians, with ranges where useful. Failed loads are excluded and counted |
| Warm-up | before the measured runs each server had one discarded start and one page load (Vite's dependency optimizer done, OS file cache warm) |
| Rspack cache | **cold**: `temp/fast-serve/cache` deleted before every start (the worst case, comparable with `heft start --clean`). **warm**: 3 start-only runs right after, using the cache (the normal second start) |
| Start → listen | port accepts connections |
| Start → ready | Rspack/Vite: `ready in` printed. Rspack: also the **first bundle** served (`/dist/bench-tree-web-part.js` returns 200, compile done). heft: `manifests.js` returns 200 (its dev middleware waits for the first webpack compile). Vite has no bundle; its transforms happen during the first page load |
| Rendered | `performance.now()` from navigation start until both web parts are in the DOM (`__benchTreeReady`, `__benchPnpReady`, all tree nodes present). SharePoint's own share is about 1.1–1.4 s |
| Requests / bytes | CDP network events for `https://localhost:<port>` (websocket excluded), `encodedDataLength` |
| Server memory / CPU | RSS and user+sys CPU of the whole server process tree from `/proc`, RSS sampled every 250 ms. CPU per load = difference across the load |
| Edits | file write → DOM changed (`MutationObserver`). Leaf: label text of a leaf node. Mid: label of a mid-level node (10/26/26 descendants). SCSS: `outline-color` of a leaf marker. **State**: before each edit the edited component's `useState` is set to `true` with a click and read from the React fiber of the current tree. "Kept" = still `true` after the update, without a page reload (a page marker on `window` survives) |
| heft specifics | heft writes `https://localhost:4321/dist/` into `manifests.js` on any port. The harness rewrites that one response via CDP `Fetch`, as in the earlier research. With two bundles heft does not auto-reload (see [HANDOFF](../HANDOFF.md)), so the harness waits 10 s, records when heft logged the hot-update request, then presses F5 and times F5 → DOM |
| Ports | 4441 / 4442 / 4443 (100 / 250 / 500), the same port for all three servers of a size, set in `config/serve.json` for heft and with `--port` for fast-serve |

## 2. Setups

The projects were generated with spfx-bench's generator (`tools/generate.mjs --modules N`) on copies of spfx-bench (`/var/tmp/rspack-impl/bench-100|250|500`), keeping both web parts. In the generator, `--modules` counts all TS/TSX modules: tree components + shared widgets (both React components, one `.tsx` each) + 12 % utils + 3 barrels + 1 types file. One in seven tree components has a `.module.scss`. So components = N − 4 − round(0.12 N), and N was chosen to give exactly 100 / 250 / 500.

| | 100 | 250 | 500 |
|---|---|---|---|
| `--modules` | 118 | 289 | 573 |
| React components (`.tsx`) | **100** (94 tree + 6 shared) | **250** (241 + 9) | **500** (483 + 17) |
| utils / barrels / types (`.ts`) | 14 / 3 / 1 | 35 / 3 / 1 | 69 / 3 / 1 |
| TS/TSX modules in `src/gen` | 118 | 289 | 573 |
| `.module.scss` (+ `_tokens.scss`) | 14 (+1) | 35 (+1) | 69 (+1) |
| files in `src/gen` / in `src` | 133 / 143 | 325 / 335 | 643 / 653 |
| tree depth, level sizes | 6: 1/2/5/11/24/51 | 7: 1/2/5/12/26/60/135 | 8: 1/2/5/11/24/54/120/266 |
| edit targets (leaf / mid (descendants) / SCSS) | Node68 / Node8 (10) / Node70 | Node173 / Node8 (26) / Node175 | Node350 / Node19 (26) / Node350 |

Same dependencies in all copies: React 18.3.1, Fluent UI 8, `@pnp/sp` 4.23, `@pnp/spfx-controls-react` 3.25 (BenchPnp web part, with a nested React 17).

**Installation:** the two fast-serve tarballs have the same package name and `fast-serve` bin, so they cannot be installed side by side. Each size therefore has two copies with identical sources: `bench-N` (heft + Rspack fast-serve) and `bench-N-vite` (Vite fast-serve), the second made with `cp -a` from the first after generating.

## 3. Server start

Medians of 3 starts, in seconds.

| Start → listen | Rspack | Vite | heft |
|---|---|---|---|
| 100 | 0.60 | 0.73 | 9.78 |
| 250 | 0.57 | 0.74 | 11.53 |
| 500 | 0.59 | 0.73 | 14.32 |

| Start → ready (`ready in` printed) | Rspack, cold cache | Rspack, warm cache | Vite | heft |
|---|---|---|---|---|
| 100 | 1.68 | 0.80 | **0.79** | – |
| 250 | 1.85 | 0.90 | **0.79** | – |
| 500 | 2.19 | 0.89 | **0.77** | – |

| Start → first bundle ready (compile done, bundle served) | Rspack, cold cache | Rspack, warm cache | Vite | heft (`manifests.js` 200) |
|---|---|---|---|---|
| 100 | 1.80 (1.74–1.81) | **1.09** (1.08–1.14) | n/a (transforms at page load) | 13.03 (12.35–14.10) |
| 250 | 1.91 (1.91–1.94) | **1.22** (1.15–1.25) | n/a | 15.35 (14.97–15.76) |
| 500 | 2.29 (2.23–2.40) | **1.17** (1.12–1.21) | n/a | 18.64 (18.63–20.45) |

Rspack's printed compile time: cold cache 1.12 / 1.29 / 1.60 s, warm cache 0.26 / 0.33 / 0.34 s.

| Start + first page rendered (ready/first bundle + cold load, derived) | Rspack, cold cache | Vite | heft |
|---|---|---|---|
| 100 | **4.8** | 5.2 | 16.2 |
| 250 | **5.1** | 6.2 | 18.6 |
| 500 | **5.7** | 7.1 | 21.8 |

## 4. Page load

Medians, seconds until both web parts have rendered. Cold = browser cache cleared, F5 = `Page.reload`.

| Cold load | Rspack | Vite | heft |
|---|---|---|---|
| 100 | **2.98** (2.94–3.22) | 4.45 (4.15–4.76; 2 of 3 OK) | 3.14 (3.04–3.39) |
| 250 | **3.17** (3.04–3.18) | 5.38 (5.16–5.69) | 3.22 (3.17–3.30) |
| 500 | 3.37 (3.31–3.80) | 6.32 (5.97–6.67; 2 of 3 OK) | **3.16** (3.13–3.47) |

| F5 | Rspack | Vite | heft |
|---|---|---|---|
| 100 | **2.11** (2.07–2.32) | 3.11 (2.96–9.82) | 2.13 (2.11–2.18) |
| 250 | **2.20** (2.09–2.41) | 3.56 (3.40–3.96) | 2.25 (2.17–2.47) |
| 500 | **2.35** (2.23–2.47) | 4.43 (4.11–11.17) | 2.46 (2.19–2.50) |

Failed loads: Vite had one failed cold load at 100 and one at 500: RequireJS "Load timeout for modules: spfx-fast-serve-loader:bench-tree-web-part!…" after a stall, the known occasional hang ([HANDOFF](../HANDOFF.md)). The F5 right after each took 9.8 s / 11.2 s. That F5 is included in the median and is the maximum of the range. Rspack and heft: 0 failures in 27 loads each.

## 5. Requests, bytes, server CPU per load

| localhost requests per load (cold = F5) | Rspack | Vite | heft |
|---|---|---|---|
| 100 | **3** | 192 | 6 |
| 250 | **3** | 384 | 6 |
| 500 | **3** | 702 | 6 |

Rspack's 3 requests are `manifests.js` and the two bundles (strings are bundled). heft's 6 are `manifests.js`, the two bundles and three loc files.

| Bytes from localhost, cold (F5) | Rspack | Vite | heft |
|---|---|---|---|
| 100 | 6.2 MB (6.2 MB) | 10.3 MB (4.5 MB, 1.4–10.3) | **0.68 MB** (0.68 MB) |
| 250 | 6.9 MB (6.9 MB) | 11.3 MB (5.4 MB, 2.4–8.6) | **0.69 MB** (0.69 MB) |
| 500 | 8.0 MB (8.0 MB) | 12.9 MB (10.0 MB, 4.0–11.4) | **0.72 MB** (0.72 MB) |

heft's responses are gzip-compressed. Rspack's are not compressed, and the bundles are served `no-store`, so every F5 transfers them again. Vite's F5 bytes vary with Chrome's memory cache (no 304s were seen). MB = 1024 KB.

| Server CPU per cold load (F5), s | Rspack | Vite | heft |
|---|---|---|---|
| 100 | **0.06** (0.05) | 1.37 (0.25) | 0.19 (0.18) |
| 250 | **0.05** (0.05) | 2.10 (0.39) | 1.10 (0.27) |
| 500 | **0.18** (0.06) | 3.45 (0.63) | 0.19 (0.76) |

## 6. Edit → DOM

Median of 3 edits (range), ms. "State" = React state kept / page reloaded.

| Leaf TSX | Rspack | Vite | heft |
|---|---|---|---|
| 100 | 123 (123–232) | **36** (32–58) | no DOM update; hot update fetched at 0.74 s, manual F5 → DOM 2.45 s |
| 250 | 170 (151–182) | **46** (41–72) | no DOM update; 0.84 s, F5 2.54 s |
| 500 | 220 (168–228) | **55** (48–89) | no DOM update; 0.79 s, F5 2.82 s |

| Mid TSX (descendants) | Rspack | Vite | heft |
|---|---|---|---|
| 100 (10) | 136 (128–151) | **49** (30–59) | no DOM update; 0.62 s, F5 2.61 s |
| 250 (26) | 154 (134–155) | **32** (32–35) | no DOM update; 0.64 s, F5 2.71 s |
| 500 (26) | 162 (153–167) | **33** (30–37) | no DOM update; 0.99 s, F5 2.90 s |

| SCSS (`.module.scss`) | Rspack | Vite | heft |
|---|---|---|---|
| 100 | 178 (175–194) | **29** (28–38) | no DOM update; 0.53 s, F5 2.78 s |
| 250 | 264 (238–393) | **38** (38–40) | no DOM update; 0.60 s, F5 2.86 s |
| 500 | 213 (209–214) | **50** (49–71) | no DOM update; 0.60 s, F5 3.12 s |

| State kept / page reloaded (all edit types, all sizes) | Rspack | Vite | heft |
|---|---|---|---|
| | **9/9 kept, 0 reloads** per size | **9/9 kept, 0 reloads** per size | 0/9 updated, 0 reloads (state lost by the manual F5) |

Notes:
- Rspack's `rebuilt in` line came 62–145 ms after the write (median per type and size). The rest is the hot-update fetch and Fast Refresh in the page. Server CPU per edit: Rspack 0.14–0.37 s, Vite 0.01–0.07 s, heft 0.9–2.7 s (tsc + Sass + webpack).
- heft (two bundles): webpack logged "compiled successfully", and the page requested both `*.hot-update.js` files 0.5–1.0 s after the write. The DOM stayed unchanged and there was no reload, even on the first edit of a session. The earlier research saw an auto-reload "only on the first edit" in some runs; here it never happened in 27 edits. The heft timings above are therefore edit → hot update fetched, and F5 → DOM after the rebuild settled.

## 7. Memory

RSS of the server process tree, MB, median of 3 starts.

| At ready / peak / at end | Rspack (cold cache) | Rspack (warm, start only) | Vite | heft |
|---|---|---|---|---|
| 100 | 448 / 450 / 367 | 418 / 418 / 372 | **137 / 316 / 241** | 891 / 904 / 674 |
| 250 | 456 / 531 / 422 | 454 / 457 / 398 | **138 / 331 / 284** | 982 / 1002 / 717 |
| 500 | 540 / 619 / 496 | 419 / 485 / 433 | **137 / 375 / 256** | 1133 / 1161 / 769 |

Peak = the highest of the 250 ms samples, the ready value, the per-load values and the end value within a start. Vite's memory grows at the first page load (transforms and the module graph), not at start.

## 8. Trends, crossover points and recommendation

How each server scales from 100 to 500 components (per 100 components):

| | Rspack | Vite | heft |
|---|---|---|---|
| start → ready / first bundle | +0.12 s cold cache; flat ~1.1–1.2 s warm | flat 0.8 s | +1.4 s (13 → 19 s) |
| cold load | +0.10 s | **+0.47 s** | flat (~3.15 s) |
| F5 | +0.06 s | **+0.33 s** | +0.08 s |
| requests | flat (3) | **+128** (≈ 64 + 1.28 per component) | flat (6) |
| bytes per load | +0.45 MB | +0.65 MB cold | flat (gzip) |
| server CPU per cold load | ~flat | +0.5 s | ~flat |
| leaf TSX edit | +24 ms | +5 ms | no HMR with two bundles |
| peak memory | +40 MB | +15 MB | +65 MB |

- **Where Vite's per-file requests start to lose:** already below 100 components in this project shape. At 100 components Vite makes 192 requests, of which about 64 are a fixed part extrapolated from the three sizes (dependency chunks, entries, shim, loc), and loads 1.5 s slower cold and 1.0 s slower on F5 than Rspack. Fitting the three points (Vite cold ≈ 3.98 s + 4.7 ms per component, Rspack ≈ 2.88 s + 1.0 ms) puts the lines' intersection at zero components, so there is no crossover inside the measured range. The earlier small-project data (spfx-rea, 3 components, about 30 requests, no Fluent/PnP: Vite 2.9–3.2 s cold vs Rspack 2.55 s, [research/rspack §4](README.md#4-q3-numbers)) shows near parity. The crossover is therefore somewhere between "a few components with light dependencies" and 100 components with Fluent and PnP, and it is driven as much by the dependency tree as by the component count.
- **Start vs page load:** Vite's flat 0.8 s start is offset by its slower first page from 100 components on. Start + first render is 0.4 s (100), 1.1 s (250) and 1.4 s (500) faster with Rspack even with an empty cache, and another 0.7–1.1 s faster with the warm cache. Every later F5 saves another 1.0–2.1 s.
- **Edit loop:** Vite stays 3–5× faster (≈30–55 ms vs 120–260 ms) and almost flat. Rspack's time grows slowly with size (rebuild of the changed module plus the bundle's hot-update chunk) but stays within the R21 target of ≤ 0.3 s at 500 components. Both keep state. The difference is about 0.1–0.2 s per edit. The F5 difference goes the other way (1–2 s per reload, growing with size).
- **heft** has a load time and request count as good as Rspack's, but its start grows by about 1.4 s per 100 components, it uses about twice Rspack's memory, and with two bundles on the page its HMR never applies.

**Recommendation:** use the **Rspack line for projects from about 100 components, or for any project with a Fluent/PnP-sized dependency tree.** It gives heft-level page loads with 3 requests, the first page sooner after start than Vite's (from 100 components, cold or warm cache), and 0.12–0.26 s HMR with state kept at the cost of 0.3–0.4 GB more RAM than Vite. The **Vite line stays the better fit for small projects**, where page loads are at parity and its 30–50 ms edits and 0.8 s start are noticeable. Neither the measured trend nor the earlier 1000-module data (Vite 8.4 s cold, 1181 requests) suggests a size where Vite's load time catches up again. Compressing Rspack's responses would only matter for remote/tunnel setups; on localhost the 6–8 MB are not what limits the load (Rspack loads as fast as heft's 0.7 MB).

## 9. What couldn't be measured / caveats

- **Vite bundledDev** was dropped from the scope at the user's request (earlier numbers: [research/bundled-dev](../bundled-dev/README.md)).
- **heft edit → DOM**: with two bundles heft never applied an update, so only edit → hot update fetched and the manual F5 are reported. heft with a single bundle on the page was not measured. heft's start was measured with `--clean` (its documented `npm start`); heft without `--clean` was not measured.
- **Vite "first bundle ready"** does not exist: Vite transforms on request, and that cost shows up in its cold load and in its CPU per load.
- Server **CPU during start** was not recorded separately, only per load and per edit.
- 1000 components were not re-run here. The earlier research (same machine, Rspack prototype, Vite beta.3, heft) has Vite 8.4–8.5 s cold / 1181 requests, the prototype 3.75 s, heft 3.56 s.
- One machine, 3 starts per cell, with a desktop session and VS Code running in the background. Network was localhost only (no throttling, no remote host or tunnel).
- Rspack responses are uncompressed and `no-store`. Compression was not tried in this benchmark.
- Two Vite cold loads (of 9) hit the known RequireJS load-timeout hang and are excluded. The F5 after each is included.
- The real customer project (500+ requests in the Vite line) was not available.

## 10. Reproduce

`/var/tmp/rspack-impl/` (temporary, outside the repo):
- `bench-100|250|500` (heft + Rspack fast-serve `1.24.0-rspack.11`), `bench-100|250|500-vite` (Vite fast-serve `1.24.0-beta.3`). The sources were restored after the edits.
- `spfx-fast-serve-helpers-1.24.0-rspack.11.tgz`, `vite-beta3/spfx-fast-serve-helpers-1.24.0-beta.3.tgz`.
- `bench-results/harness/`: `profile.mjs <project> <out>` (edit targets and ready condition from `bench-targets.json`), `measure.mjs --kind=rspack|vite|heft --size=100|250|500 [--cache=cold|warm] [--runs --loads --edits]`, `all.sh` (warm-ups, then rspack cold, rspack warm, vite and heft per size), `summarize.mjs` → `summary.json`.
- `bench-results/<size>-<server>.json|log`: raw runs (every load, every edit, server log heads). `warmup-*` and `smoke-*` are the discarded warm-up and smoke runs.
