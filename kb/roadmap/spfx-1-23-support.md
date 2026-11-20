---
title: SPFx 1.23 support
type: roadmap
status: current
tags:
  - project-kb
  - roadmap
  - versioning
  - spfx
  - css-modules
  - react
---

# SPFx 1.23 support

## Summary

Supporting SPFx 1.23 is researched, feasible and cheap, but not decided. With only the version check bypassed, the unchanged 1.24 package served a 1.23 project live with Fast Refresh, SCSS hot swap and theme tokens. The one real gap is the CSS module rule: SPFx 1.23 treats every non-`.global` style file as a CSS module. Recommended: one package for `>=1.23 <1.25` with a small per-minor SPFx profile, effort M (about 2–3 days).

## Current Knowledge

### Status

- Discovery only; no code changed. The decision belongs to the user. Today 1.23 projects get `Unsupported SPFx version` and must upgrade (see [Version policy](../decisions/version-policy.md)).
- Why it matters: the 1.23 → 1.24 upgrade brings React 18 (`createRoot`, third-party React 17 libraries), which is why teams stay on 1.23.

### What is the same in 1.23

- Same Heft toolchain: every Heft/Rushstack API `fast-serve` loads from the project (Sass processor, project configuration and rig reading, static-asset typings schema, `@microsoft/sp-css-loader`) is API-compatible and resolves the same way.
- Rig `tsconfig-base.json`, static-asset typings config, generator `config.json`/`serve.json`/manifests, the production manifest shape, SPFx library ids, `sp-css-loader` code and class-name hash, webpack, sass-embedded and TypeScript 5.8 match.
- `temp/sass-ts` and `temp/static-asset-ts` written by `fast-serve` were byte-identical to `heft build` 1.23 output; `heft build` 1.23 still succeeds with `fast-serve` installed.
- The package installs into a 1.23 project without `--legacy-peer-deps`.
- On the 1.25 test tenant the facades loaded every `sp-*` library at 1.25.0, as with 1.24.

### Gaps and fixes

| Gap | Impact | Fix |
|---|---|---|
| Version check accepts only the package's `major.minor` | refuses to start (policy) | accept a list of supported minors; update the hint text |
| **CSS module rule**: in 1.23 every style file without `.global` (plain `.scss`, `.css`, and plain `.css` from `node_modules`) is a CSS module; in 1.24 and in Vite only `*.module.*` files are | `import styles from './Foo.scss'` builds with heft 1.23 but fails to load in `fast-serve` ("does not provide an export named 'default'"), and the error hint wrongly blames a TypeScript type or `const enum` | 1.23 profile: treat non-`.global` project styles as CSS modules (Vite decides by `.module.` in the module id, so this needs a resolve/rename step that keeps HMR, source maps, themed styles and SPFx class naming), and use the 1.23 rule for library CSS; decide whether to hash third-party plain `.css` like 1.23 production or document the difference |
| Missing-export hint names only TS types / `const enum` | misleading for a style import | add a style-file hint (useful for 1.24 too) |
| React 17.0.1 with `react` + `react-dom` externals and `ReactDOM.render` (1.24: React 18.3.1, `react-dom/client`) | pre-bundling asks for `react-dom/client` and prints a harmless "Failed to resolve dependency" | include only React entries that resolve from the project; Fast Refresh works with React 17 (verified) |
| Sass bare specifiers: the 1.24 rig resolves them as packages, 1.23 doesn't | typings identical; Vite's Sass compile is more permissive than `heft build` 1.23 | none (Heft build is the gate) |
| `*.sprite.svg`: 1.23 imports a file URL (Vite's default), 1.24 imports source text | none for 1.23 (the 1.24 rule is a separate 1.24 gap) | none |
| Node: 1.23 projects declare `>=22.14 <23` | `fast-serve` allows 22/24/26 | docs only |

### Packaging options

- **(b) One package for `>=1.23 <1.25` (recommended):** a per-minor SPFx profile in the project model (accepted minors, CSS module rule, React entries). One codebase and release; a future minor is one profile entry. Breaks the "version equals SPFx minor" convention, so the README must say that 1.24.x supports SPFx 1.23 and 1.24; tests need a 1.23 fixture or smoke project.
- (a) A separate `1.23.x` line: same initial code work (the CSS gap exists either way), then every fix and release twice; the classic tool's per-minor branches show that cost.
- (c1) An escape-hatch flag allowing other minors with a warning: tiny, but users hit the CSS gap unfixed.
- (c2) No support: tell users to upgrade.
- Only dev/test dependencies are SPFx-minor specific (`@microsoft/sp-css-loader`, `@rushstack/heft-sass-plugin`, `@rushstack/heft-static-asset-typings-plugin`, `@rushstack/heft-config-file`, `@rushstack/rig-package`); runtime dependencies (Vite, `@vitejs/plugin-react`, the certificate manager) are not, because Heft packages are loaded from the project.

### Plan for option (b), effort M

1. Version check with a list of supported minors, range text and hints (S).
2. Per-minor profile on the project model: CSS module rule, React entries (S).
3. Pre-bundle only the React entries that resolve (S).
4. 1.23 CSS modules for project styles and library CSS, the third-party `.css` decision, the style-import hint (M, the main item).
5. Unit tests for profile, version check and CSS rule; a scripted smoke test on a generated 1.23 project (install tarball, start, fetch `manifests.js`, compare typings with `heft build`); one live pass with a web part, Fast Refresh, SCSS, a plain-SCSS module and an extension (S–M).
6. Docs: version table (1.23 with React 17 and `ReactDOM.render`, Node 22) and migration notes (S).

Ongoing cost: each new SPFx minor needs about half a day to diff the webpack rules, rig configs and React externals, then a profile entry. Retiring 1.23 later means removing one profile entry and its fixture.

### Not verified

- Extensions and ACEs on 1.23, a deployed 1.23 `.sppkg` on a newer tenant, and Node 22 runs are inferred, not run.

## Links

- [Version policy: package follows the SPFx minor](../decisions/version-policy.md)
- [Unsupported scope](../limitations/unsupported-scope.md)
- [Styles, theme tokens and asset typings](../features/styles-and-assets.md)
- [Styles, localization and assets in SPFx](../concepts/styles-localization-assets.md)
- [Development React from the project for Fast Refresh](../decisions/development-react.md)
- [Roadmap overview](overview.md)

## Evidence

- Source: SPFx 1.23 support research (generated 1.23.2 and 1.24.1 projects compared side by side, heft rule probe, live check on the test tenant with nothing saved)
- Confidence: high for verified items; extensions/ACEs on 1.23 inferred (medium); effort is an estimate
- Last checked: 2026-11-18
