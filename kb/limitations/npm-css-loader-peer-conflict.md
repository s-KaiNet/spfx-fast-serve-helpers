---
title: npm peer conflict with css-loader 7.1.2
type: limitation
status: current
tags:
  - project-kb
  - install
  - npm
  - dependencies
---

# npm peer conflict with css-loader 7.1.2

## Summary

`npm install --save-dev <tarball>` fails with `ERESOLVE` in an SPFx 1.24 project whose `css-loader` resolves to 7.1.2 or 7.1.3: those versions declare the optional peer `@rspack/core@"0.x || 1.x"`, and `fast-serve` brings `@rspack/core` 2. There is no package-side fix; the user-side fix is to update `css-loader` to 7.1.4 or newer in the same install command, the fallback is `--legacy-peer-deps`.

## Current Knowledge

### When it happens

- `css-loader` is a direct devDependency of SPFx 1.24 projects (`~7.1.2`) and a dependency of `@microsoft/sp-css-loader` (`~7.1.2`); npm dedupes both to one copy at the top of `node_modules`.
- The conflict appears when that copy is 7.1.2 or 7.1.3: an exact `7.1.2` pin, or `~7.1.2` locked at 7.1.2 in `package-lock.json` (npm does not move a locked version to resolve the conflict).
- `css-loader` 7.1.4 and newer declare `0.x || ^1.0.0 || ^2.0.0-0`; a project already on 7.1.4+ installs without any flag.
- pnpm and yarn report unmet optional peers as warnings, not errors.

### Fixes for users

- `npm install --save-dev css-loader@^7.1.4 <tarball>`: one command, no flags; `@microsoft/sp-css-loader`'s `~7.1.2` accepts it and heft's production build works with it.
- Keep the old `css-loader`: `--legacy-peer-deps`, or `legacy-peer-deps=true` in the project's `.npmrc` so later `npm install` runs don't fail either.

### Why the package can't fix it

- npm places `@rspack/core` at the top of `node_modules`, where the project's `css-loader` checks its peer range, and reports the broken optional peer instead of nesting `@rspack/core` deeper.
- Installing `@rspack/core` under an alias does not help: `@rspack/dev-server` declares `@rspack/core` as a required peer, so npm installs it under its real name at the top again.
- `overrides` work only in the root project's `package.json`; a peer dependency would be placed at the top as well.
- Bundling `@rspack/core` into the package would also have to ship its platform-specific native binding packages.

## Links

- [CLI, options and startup](../features/cli-and-options.md)
- [Rspack facts and references](../references/rspack.md)

## Evidence

- Source: reproduced on 2026-11-20 with npm 11.19 and Node 24 in a copy of an SPFx 1.24.1 project (exact `7.1.2`, and `~7.1.2` locked at 7.1.2): plain install fails with `ERESOLVE`; adding `css-loader@^7.1.4` to the same command installs 7.1.5 and `npm run build` (heft) passes; a probe package with an aliased `@rspack/core` and `@rspack/dev-server` fails with the same `ERESOLVE` through dev-server's peer; peer ranges read from the npm registry for `css-loader` 7.1.2–7.1.5.
- Confidence: high
- Last checked: 2026-11-20
