# SPFx 1.23 support in the Rspack implementation (branch `v1.23`)

Date: 2026-11-24. The [Vite-era report](README.md) (2026-11-18) stays as history; this one re-checks every item against the Rspack code (`spfx-fast-serve-helpers` 1.24.0, branch `v1.24`) and plans the `v1.23` branch.

Project: `/var/tmp/spfx123-rs/hello123`, generator 1.23.2 (React web part, then an Application Customizer and a Generic ACE added with the generator), npm, Node 24.21.0. Reference packages: `@microsoft/spfx-heft-plugins` and `@microsoft/spfx-web-build-rig` 1.23.2 vs 1.24.2 unpacked in `/var/tmp/spfx123-rs/cmp`.

## Packaging decision: one branch per SPFx minor

Each SPFx minor gets its own branch and its own package line, as the classic versions already do (`v1.21` → `1.21.x`). Branch `v1.23` is cut from `v1.24` and publishes `spfx-fast-serve-helpers` `1.23.x`; branch `v1.24` keeps `1.24.x`. Each branch is written for its SPFx version only:

- **No version branching in the code.** No profile on the project model, no `if (1.23)` / `if (1.24)`, no per-version rule tables. The `v1.23` code hard-codes what heft 1.23 does; what 1.23 doesn't have is deleted, not switched off.
- **The version check needs no change.** `project/spfxVersion.ts` already accepts the `major.minor` of the package's own version, so `"version": "1.23.0"` makes it accept SPFx 1.23.x only. Its hints already point a 1.24 project to `spfx-fast-serve-helpers@~1.24.0` and a 1.22 project to an upgrade.
- **Shared fixes** (bugs that hit both versions, like the plain `.css` class names below) are committed on `v1.24` and cherry-picked to `v1.23`.

This replaces the Vite report's option (b) (one package for `>=1.23 <1.25` with a per-minor profile).

## Answer

- **Feasible and small: S, about 1 day.** With only the version check bypassed, the unchanged 1.24.0 tarball starts on the 1.23.2 project (ready in about 1.1 s), compiles the web part, Application Customizer and ACE bundles, writes `manifests.js` with the 1.23.2 SPFx library ids/versions and the serve-configuration query, type-checks and lints with the project's TypeScript 5.8 / ESLint 9.37, and bundles the project's React 17.0.1 with the React Refresh runtime. SCSS typings and static-asset typings are byte-identical to `heft build` 1.23. The AMD dependency lists match heft's (minus `react`/`react-dom` and the loc modules, as for 1.24).
- **One real gap, same as in the Vite report: the CSS module rule.** In 1.23 every `.css` without `.global` (after Sass: every `.scss`/`.sass`/`.css` source without `.global`, and plain `.css` from `node_modules`) is a CSS module; in 1.24 only `*.module.*`. With the 1.24 rules, `import plain from './Plain.scss'` compiles with the warning `export 'default' … was not found in './Plain.scss' (module has no exports)` and `plain.plainProbe` is `undefined` at runtime, while heft 1.23 hashes it.
- **In Rspack the fix is replacing four regexes** (the Vite version decided by `.module.` in the module id). Verified by patching them in the installed `lib/features/build/styles/index.js`: no warnings, and `plainProbe_4e6ef258`/`helloWorld_4e2f9ee7` are the same names as heft 1.23's `dist`.
- **The rest is deleting 1.24-only parts** (sprite rule, `zip` assets, Copilot components) and moving tests, fixtures and docs to 1.23.

## 1.23 vs 1.24, re-checked for Rspack

| # | Area | 1.23.2 | 1.24.2 | Rspack fast-serve 1.24 | On `v1.23` |
|---|---|---|---|---|---|
| 1 | Version check | — | — | `project/spfxVersion.ts` accepts the package's `major.minor` only | package version `1.23.0`; no code change; tests move to 1.23 |
| 2 | CSS module rule | `CSS_MODULE_RULE_TEST = /(?<!\.global(?:\.(?:scss\|sass))?)\.css$/i`, global `/\.global(?:\.(?:scss\|sass))?\.css$/i`, applied to all `.css`, `node_modules` included | `/\.module(?:\.scss)?\.css$/i` / `(?<!\.module(?:\.scss)?)\.css$` | 1.24 regexes in `features/build/styles/index.ts` (`MODULE_CSS`, `GLOBAL_CSS`, `MODULE_SASS`, `GLOBAL_SASS`) | replace with the 1.23 ones: module = not `.global` (`/(?<!\.global)\.css$/i`, `/(?<!\.global)\.s[ac]ss$/i`), global = `.global` |
| 3 | `*.sprite.svg` | file URL (part of `FILE_LOADER_RULE_TEST`) | `asset/source` | `asset/source` rule in `features/build/assets/index.ts` | delete the rule (falls to `asset/resource`) |
| 4 | `zip` assets | not in `FILE_LOADER_EXTENSIONS` | `asset/resource` | in `ASSET_EXTENSIONS` | delete `zip` |
| 5 | React | 17.0.1, `react` + `react-dom` externals in prod | 18.3.1, `react-dom/client` external | React bundled from the project, alias only for requests that resolve (`features/build/react.ts`) | nothing; 17.0.1 bundled with the refresh runtime (Fast Refresh to check live) |
| 6 | Version-pinned / flighted externals, `react-dom/client` external | — | new in 1.24 | not implemented (prod-only) | nothing |
| 7 | Copilot components, `copilot-agent` heft task | none (heft 1.23 has no `CopilotComponent`) | new | `CopilotComponent` accepted in `project/readers/bundles.ts`; tool `propertiesSchema` references resolved in `features/build/manifests/manifestReferences.ts` (+ `moduleExports.ts`) | delete: component type, reference resolution, `test/fixtures/copilot`, the Copilot half of `test/scenarios/copilotAndLibrary.test.ts`, README section, `kb/features/copilot-components.md` |
| 8 | Sass plugin | heft-sass-plugin 1.4.1, no `resolveBareSpecifiersAsPackages` | 1.5.0, option on in the rig | `SassProcessor` loaded from the project, extra option ignored by 1.4.1; sass-loader resolves bare specifiers in both | nothing (heft build is the gate, as in the Vite report) |
| 9 | Static asset typings | plugin 0.1.3 | 0.1.26 | schema/subpaths resolve, output identical | nothing |
| 10 | Rig | `heft.json` without `copilot-agent`, `sass.json` without #8, same `tsconfig-base.json`, `static-asset-typings.json`, `fileExtensions`/`nonModuleFileExtensions`/`cssOutputFolders`/`doNotTrimOriginalFileExtension`/`preserveIcssExports`/`sourceMap` | | | nothing |
| 11 | Debug manifests (`ManifestPlugin`, `CumulativeManifestProcessor`, `ManifestsFileBuilder`) | | refactors, integrity/flighting, `relativeProjectPath` in the cumulative cache | own `manifests.js` | nothing |
| 12 | Node | `engines` `>=22.14 <23` in the generated project | | allows 22/24/26 | docs only |

Linked library projects are compiled with the consumer's rules, like heft, which compiles their `lib` output with the consumer's webpack config: on `v1.23` that is the 1.23 CSS module rule for both.

## Found on the way (also affects 1.24, fix on `v1.24` and cherry-pick)

Plain `.css` sources: heft compiles them with Sass too (rig `fileExtensions` includes `.css`) to `lib/<name>.css.css` and hashes that file and Sass's reformatted CSS. `heftCssFileMapper` (`features/build/styles/cssClassName.ts`) maps only `.scss/.sass`, and our `.css` rule has no Sass loader, so a CSS-module `.css` source gets a different class-name suffix than heft (1.23 probe: heft `plainCssProbe_5411ccc6`, fast-serve `plainCssProbe_40c1d67a`; mapping `.css` alone gave `fd82a150`, because the CSS text still differs). In 1.24 this hits `*.module.css` in `src`; in 1.23 every plain `.css` in `src`. Functional either way (class names in the bundle and the CSS agree); only heft-identical names break. Fix: run `src` `.css` through the Sass loader and include `.css` in the mapper (S). Not part of the `v1.23` work.

## Plan (branch `v1.23`)

1. Branch `v1.23` from `v1.24`; `package.json` version `1.23.0`, description for SPFx 1.23.x; `@microsoft/sp-css-loader` dev dependency `1.23.2` (same code as 1.24.x). (XS)
2. `features/build/styles/index.ts`: the 1.23 CSS module rule (plain `.css` from `node_modules` included, as heft 1.23 does). Tests: plain `.scss`/`.css` are modules with heft-1.23 names, `.global.scss` stays global. (S)
3. `features/build/assets/index.ts`: delete the sprite rule and `zip`; tests: sprite as URL. (XS)
4. Delete Copilot component support (#7) with its fixture, tests and docs. (S)
5. Tests and fixtures: SPFx versions in the fake packages and expectations `1.24.x` → `1.23.2`; version-check tests for 1.23. (S)
6. Docs: README (SPFx 1.23 with React 17 and `ReactDOM.render`, the CSS module rule, Node 22 for 1.23, no Copilot components), `cli/help.ts`, `schema/config.schema.json`, the shipped skill, KB pages that name the version, `research/HANDOFF.md`. (S)
7. Gate: `pnpm -s build && pnpm -s lint && pnpm -s typecheck && pnpm -s test`. (—)
8. Smoke and live pass (done, see Evidence): the generated project above (install tarball → start → `manifests.js` → typings diff with heft) and one SharePoint page pass with the `spfx-debugging` skill: web part render, Fast Refresh with React 17 and state kept, SCSS hot swap, plain-`.scss` module, Application Customizer via `--config`, ACE. (S–M)

## Evidence and reproduction

- Version check bypass in the installed copy: `projectVersion.minor === supported.minor` → `(… || projectVersion.minor === 23)` in `lib/project/spfxVersion.js`.
- Rule probe: `Plain.scss`, `PlainCss.css`, `Glob.global.scss` imported from `HelloWorld.tsx`, class names rendered into a `data-probe` attribute. heft 1.23 `dist`: `plainProbe_4e6ef258`, `plainCssProbe_5411ccc6`, `helloWorld_4e2f9ee7`, `globalProbe` unhashed. fast-serve unpatched: two `ESModulesLinkingWarning`s, no hashed plain names; with the 1.23 regexes: no warnings, `plainProbe_4e6ef258`, `helloWorld_4e2f9ee7`.
- Rule sources: `WebpackConfigurationGenerator.js` lines 96–132 and 320–335 (1.23.2: `FILE_LOADER_EXTENSIONS` without `zip`, no sprite rule) vs the `options.cssModuleRuleTest ??` rule, `zip` and the `.sprite.svg` rule (1.24.2). `CopilotComponent` appears only in heft 1.24.2 (`packageSolutionPlugin`, `copilotAgentPlugin`).
- Smoke and live pass on branch `v1.23` (2026-11-24, packed `1.23.0` installed in a copy of the generator 1.23.2 project, `/var/tmp/spfx123-v123/hello123`): `spfx-fast-serve-helpers 1.23.0, SPFx 1.23.2`, ready in about 1 s, no compile warnings (the 1.24.0 package printed two `ESModulesLinkingWarning`s here), type check clean. Plain `.scss` and `.css` are CSS modules; the served names (`plainProbe_5bf28850`, `helloWorld_60dc013d`) equal heft's algorithm for the copy's path, and the same algorithm for the original project's path gives exactly heft's `dist` names (`plainProbe_4e6ef258`, `helloWorld_4e2f9ee7`): the hash is keyed by the absolute `lib` path. Hosted workbench (the SharePoint Online workbench is still up until 2026-12-01; no page saved): web part rendered with the hashed plain-module class names; a text edit in the class component hot-updated without reload; a `Plain.scss` edit swapped the styles in place; a new function component with `useState` kept its state (`3`) through an edit (Fast Refresh with React 17); the Status ACE rendered its card; a web part class edit reloaded the page. On a SharePoint page, `--config banner` with the printed extension query loaded the Application Customizer (its `Test message` shown), no console errors.
- Not checked yet: Command Set / Field / Form Customizers and linked library projects on 1.23 (same manifest handling in heft 1.23 and 1.24).
