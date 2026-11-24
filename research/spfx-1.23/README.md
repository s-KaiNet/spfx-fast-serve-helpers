# Research: supporting SPFx 1.23 in fast-serve

Date: 2026-11-18. Discovery only: nothing in `src/` or `package.json` was changed. Projects used: `/tmp/spfx123/hello123` (generator 1.23.2, React web part) and `/tmp/spfx124ref/hello124` (generator 1.24.1, same answers), both installed with npm on Node 24.21.0.

## Answer

- **Feasible: yes, and cheap.** SPFx 1.23 already uses the same Heft toolchain. Every Heft/Rushstack API fast-serve calls (`SassProcessor`, `ProjectConfigurationFile`, `RigConfig`, the static-asset schema, `sp-css-loader`) is API-compatible and resolves through the same subpaths. With only the version check bypassed, the **unchanged 1.24.0 tarball** served a 1.23.2 project live on the 1.25.0 tenant: render, React Fast Refresh with state kept (React 17), SCSS hot swap, theme tokens, reload on a web part class edit. SCSS and static-asset typings are byte-identical to `heft build` 1.23.
- **One real behavioural gap:** in SPFx 1.23, **every style file without `.global` is a CSS module**: plain `Foo.scss`, `Foo.css`, and also plain `.css` from node_modules. In 1.24 (and in Vite) only `*.module.*` files are CSS modules. A 1.23 project with `import styles from './Foo.scss'` builds with heft 1.23 but **fails to load** in fast-serve (`does not provide an export named 'default'`), and the error message wrongly blames a TypeScript type or `const enum`.
- **Recommended: option (b), one package for `>=1.23 <1.25`** with a small per-minor "SPFx profile" in the project model (accepted minors, CSS module rule, React entry points). **Effort: M (about 2–3 days)**, most of it the CSS module rule and a 1.23 smoke test. Option (a), a separate `1.23.x` line, needs about the same code work at first (the CSS gap exists either way), then doubles every later fix and release; the classic spfx-fast-serve history shows that cost.

## Blockers and problems

| # | Area | 1.23 vs 1.24 | Impact on fast-serve | Severity | Fix |
|---|---|---|---|---|---|
| 1 | Version check | `spfxVersion.ts` accepts only the package's `major.minor` | refuses to start (by design) | blocker (policy) | accept a list of supported minors; update the hint text |
| 2 | CSS module rule | 1.23 `CSS_MODULE_RULE_TEST = /(?<!\.global(\.(scss\|sass))?)\.css$/` (all non-global CSS, node_modules included); 1.24 `/\.module(\.scss)?\.css$/` | plain `.scss`/`.css` in `src` served as global CSS; a default import breaks the bundle load. Third-party plain `.css` is hashed in 1.23 prod, global in dev | **problem, real** | 1.23 profile: treat non-`.global` project styles as CSS modules (Vite only looks at `.module.` in the id, so this needs a resolve/rename step), and use the 1.23 regex in `libraryCss/resolveLibraryCss.ts` `isCssModuleFile`. Decide whether to hash third-party plain `.css` like 1.23 or document the difference |
| 3 | Error text | — | the shim's "missing export" hint blames TS types/`const enum` for a style import | minor | add a style-file hint (useful for 1.24 too) |
| 4 | React | 1.23: React **17.0.1**, `react` + `react-dom` externals, `ReactDOM.render`; 1.24: React 18.3.1, `react` + `react-dom/client` | `optimizeDeps.include` hardcodes `react-dom/client` → startup message `Failed to resolve dependency: react-dom/client` (harmless). Fast Refresh works with React 17 (verified) | cosmetic | include only the React entries that resolve from the project |
| 5 | Sass bare specifiers | 1.24 rig sets `resolveBareSpecifiersAsPackages: true` (heft-sass-plugin 1.5.0); 1.23 (1.4.1) has neither that nor `loadPaths` | typings: extra options are ignored by 1.4.1, output identical. Vite's Sass compile resolves bare specifiers in both, so dev is more permissive than `heft build` 1.23 | none (heft build is the gate) | — |
| 6 | `*.sprite.svg` | 1.24 imports them as source text; 1.23 as a file URL | Vite's default (URL) matches 1.23. fast-serve doesn't implement the 1.24 rule either (separate 1.24 gap) | none for 1.23 | — |
| 7 | Node | 1.23 `engines` `>=22.14 <23` (generator project) | fast-serve allows 22/24/26. `heft build` 1.23 still ran on Node 24 (warnings only) | none | docs only |
| 8 | Tenant | page serves sp-* 1.25.0, React 18.3.1 | facades load by id with a minimum version: got 1.25.0 for every sp-* (same as 1.24) | none | — |

Things that are the same (checked): rig `tsconfig-base.json` (target es5, `experimentalDecorators`, `importsNotUsedAsValues: remove`, `jsx: react`), `static-asset-typings.json`, sass.json apart from #5, `config.json`/`serve.json`/manifest files from the generator, the production manifest shape (AMD `define("<id>_<ver>", …)`, `scriptResources` types), SPFx library ids in `node_modules/@microsoft/*/dist/*.manifest.json` (1.23 additionally has `sp-image-helper` as a transitive dependency), `sp-css-loader` code (byte-identical `lib-commonjs`, same HMAC class-name hash), webpack 5.105.4, sass-embedded 1.85.1, TypeScript 5.8.

## Side-by-side versions (generated projects, `node compare-versions.mjs …`)

| Package | 1.23.2 project | 1.24.1 project |
|---|---|---|
| `@microsoft/spfx-heft-plugins` / `spfx-web-build-rig` | 1.23.2 | 1.24.1 |
| `@rushstack/heft` | 1.2.17 | 1.3.2 |
| `@rushstack/heft-sass-plugin` | 1.4.1 | 1.5.0 |
| `@rushstack/heft-static-asset-typings-plugin` | 0.1.3 | 0.1.26 |
| `@rushstack/heft-config-file` | 0.20.3 (root), 0.20.10 | 0.20.16 |
| `@rushstack/rig-package` | 0.7.2 (root), 0.7.3 | 0.7.3 |
| `@rushstack/debug-certificate-manager` | 1.7.10, 1.7.13 | 1.7.30 |
| `@microsoft/sp-css-loader` | 1.23.2 | 1.24.1 |
| `@rushstack/heft-typescript-plugin` / `heft-webpack5-plugin` | 1.3.2 / 1.3.10 | 1.3.24 / 1.3.30 |
| `react` / `react-dom` | 17.0.1 | 18.3.1 |
| `@types/react` | 17.0.45 | 18.2.79 |
| `typescript` (project) | ~5.8 | ~5.8 |

spfx-heft-plugins 1.23 → 1.24 code changes are all build-side (fast-serve doesn't call them): `react-dom/client` external, version-pinned externals, flighted dependencies, copilot-agent task, `.zip`/`.sprite.svg` rules, package-solution changes and the CSS rule in #2.

## What was verified, and how

Hands-on (local, `/tmp` projects):
- `pnpm build && pnpm pack` here, `npm i -D` of the tarball into the 1.23 project: installs cleanly (no `--legacy-peer-deps`).
- Unpatched: refuses with the expected message ("SPFx 1.23 is not supported… Upgrade the project to SPFx 1.24").
- Patched only in `node_modules/spfx-fast-serve-helpers/lib/project/spfxVersion.js` ([spfxVersion-bypass.diff](spfxVersion-bypass.diff)): ready in 155–172 ms on port 4391. `manifests.js` correct (the `sp-loader` entry is version 1.23.2), the bundle shim, entry, TSX and SCSS modules all return 200. React 17 is pre-bundled (`react-HAlHReYA.js` = React v17.0.1, scheduler 0.20.2).
- `temp/sass-ts` and `temp/static-asset-ts` written by fast-serve are **byte-identical** to `heft build --clean` 1.23 output (`diff -r`).
- `heft build --clean` 1.23 still succeeds with fast-serve installed (and on Node 24).
- CSS rule probe (`Plain.scss`, `PlainCss.css` imported from HelloWorld.tsx): heft 1.23 hashes both (`plainProbe_2fb0e5c7`, `plainCssProbe_1bf1ced3`) and generates typings; heft 1.24 leaves them global and warns `export 'default' … was not found in './Plain.scss'`; fast-serve serves them as global CSS.

Live (contoso, hosted workbench with the debug query, web part added from the toolbox, **nothing saved**; Chrome on the saved profile started and stopped by me, `sessionStorage["spfx-debug"]` cleared):
- web part renders ([screenshot](live-workbench-1.23.png)); `[vite] connected.`; loaded sp-* modules are all `_1.25.0`, the page's React is 18.3.1, the web part runs on the dev React 17 copy;
- function component edit ([Counter.probe.tsx](Counter.probe.tsx)): text v1 → v2 with the counter state (3) and the `window.__mark` marker kept: Fast Refresh;
- SCSS edit: outline applied, marker kept; theme token `[theme:bodyText]` resolved to the tenant's `#323130`;
- web part class edit: page reloaded (marker gone), new property text shown;
- `import plain from './Plain.scss'`: hot update failed, after reload "Something went wrong" with `[fast-serve] Failed to load bundle … does not provide an export named 'default'` plus the misleading TS hint; recovers after reverting.
- The workbench also probes `localhost:4321` on its own and shows a "web part will not appear in the toolbox" warning; the web part is listed anyway (same with 1.24, not 1.23-specific).

Inferred (not run): extensions and ACEs on 1.23 (same manifest processing in heft; `@microsoft/sp-adaptive-card-extension-base@1.23.2` exists on npm; generator 1.23 extension templates use `ReactDOM.render`); a deployed 1.23 `.sppkg` on the 1.25 tenant (SharePoint's normal backward compatibility; the dev path doesn't depend on it); Node 22 runs (allowed by both).

## Packaging options

How classic spfx-fast-serve did it: one branch per SPFx minor (`origin/v1.11` … `origin/v1.21`), package version `1.<spfx minor>.x`, each branch pinning its own `@microsoft/spfx-heft-plugins`, webpack, TypeScript, `loader-load-themed-styles`; `checkVersions()` threw on any SPFx minor ≠ package minor. Fixes were re-applied by hand on each branch (for example "Fixed problem with containers": `8814ece` on v1.19 and `3e44d5d` on v1.20, "Fixed schema utils problem" on both). The old `PackageVersions.md` (`git show ee3b60b^:PackageVersions.md`) only lists packages held back for ESM reasons; nothing per SPFx version. That model made sense because webpack configs really differed per minor; here the Heft APIs fast-serve uses are stable.

| Option | What it is | Pros | Cons |
|---|---|---|---|
| (a) separate line `spfx-fast-serve-helpers@1.23.x` (branch `v1.23` from `vite`) | version check unchanged (follows SPFx); the branch carries the 1.23 CSS rule and the React include; dev deps pinned to 1.23 versions | matches the classic convention and the current error message; no runtime switching; tests run against real 1.23 packages | every fix/feature cherry-picked and released twice, double live acceptance; the CSS work is the same as in (b) anyway; npm `latest` tag handling for two lines |
| (b) one package, `>=1.23 <1.25` (**recommended**) | `project/spfxProfile.ts`: installed minor → `{ cssModuleRule, reactEntries }`; version check accepts known minors | one codebase, one release; adding 1.25 later = one profile entry; the delta is small and data-like | breaks the "version = SPFx minor" convention (needs README wording: 1.24.x supports SPFx 1.23 and 1.24); the test matrix needs a 1.23 fixture |
| (c1) escape hatch only | e.g. `--unsupported-spfx` flag allowing other minors with a warning, plus docs listing the 1.23 CSS caveat | XS effort | users hit #2 without a fix; support questions |
| (c2) no support | tell users to upgrade to 1.24 | zero code | the 1.23 → 1.24 upgrade means React 18 (`createRoot`, third-party React 17 libs), which is exactly why people stay on 1.23 |

Dependencies that would be pinned per SPFx version: only the **dev/test** deps (`@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin`, `@rushstack/heft-static-asset-typings-plugin`, `@rushstack/heft-config-file`, `@rushstack/rig-package`; today pinned to the 1.24.1 set). Runtime deps (Vite, plugin-react, debug-certificate-manager, terminal) don't depend on the SPFx minor, because all Heft packages are loaded from the project. For (a) the 1.23 branch pins `1.23.2 / 1.4.1 / 0.1.3 / 0.20.3 / 0.7.2`. For (b) keep the 1.24 set as dev deps and cover 1.23 with a separate smoke project (or npm aliases such as `sp-css-loader-1-23: npm:@microsoft/sp-css-loader@1.23.2` if unit tests must load both).

## Effort

**(b) one package — M (about 2–3 days)**
1. `project/spfxVersion.ts`: supported minors `[1.23, 1.24]`, range text, hints; tests (S).
2. `project/spfxProfile.ts` (new) from the installed version: CSS module rule, React entries; exposed on the project model (S).
3. `loader/index.ts`: `optimizeDeps.include` filtered to resolvable entries (drops `react-dom/client` on React 17) (S).
4. 1.23 CSS modules (M, the main item): in `styles/`, make non-`.global` `.scss/.sass/.css` under `src` CSS modules (Vite decides by `.module.` in the id: resolve them to an id Vite treats as a module and keep HMR, source maps, themed styles and class naming working); `libraryCss` `isCssModuleFile` by profile; a decision and docs on third-party plain `.css` (hashed in 1.23 prod); a style-import hint in the shim's missing-export message.
5. Tests: unit tests for the profile, the version check, the CSS rule (fixture with plain `.scss` + `.global.scss`); a scripted smoke test on a generated 1.23 project (install tarball → start → fetch `manifests.js` → compare typings with `heft build`); one live pass (web part, Fast Refresh, SCSS, plain-SCSS module, an extension) (S–M).
6. Docs: README version table (1.23 with React 17 and `ReactDOM.render`, Node 22), migration notes (S).

**(a) separate line — S–M initially (about 1.5–2.5 days), then ongoing L**: items 3–6 on the branch without the profile switching, plus pinning dev deps to 1.23 and a release line. Then every change goes to two branches, two releases, two live acceptances.

**Ongoing cost of (b):** each new SPFx minor means diffing `WebpackConfigurationGenerator` rules, rig `sass.json`/`static-asset-typings.json`/`tsconfig-base.json` and React externals (this report's method, about half a day), then adding a profile entry. Retiring 1.23 later means deleting one entry and its fixture.

## Evidence

- [compare-versions.mjs](compare-versions.mjs): version table generator (run with package names; paths are hardcoded to the `/tmp` projects).
- [spfxVersion-bypass.diff](spfxVersion-bypass.diff): the only patch, applied in the installed copy.
- [Counter.probe.tsx](Counter.probe.tsx): the Fast Refresh probe component.
- [live-workbench-1.23.png](live-workbench-1.23.png): 1.23 web part served by fast-serve in the hosted workbench.
- Rule source: `node_modules/@microsoft/spfx-heft-plugins/lib-commonjs/plugins/webpackConfigurationPlugin/WebpackConfigurationGenerator.js` lines 131–132 (1.23.2) vs the `options.cssModuleRuleTest ??` rule (1.24.1).
- fast-serve code involved: `src/project/spfxVersion.ts`, `src/loader/index.ts:31`, `src/styles/index.ts`, `src/styles/libraryCss/resolveLibraryCss.ts`, `src/utils/heftProject.ts` (unchanged, works with 1.23).
