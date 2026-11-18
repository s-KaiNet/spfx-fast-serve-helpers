# SPFx libraries that import `.module.scss` but ship only `.module.scss.css`

> Experiment files, logs and captures referenced here were removed from the repo in a cleanup; they are in git history at commit `dd4da8d`.

Benchmark finding F1 ([../benchmark/README.md](../benchmark/README.md)). Tools: SPFx 1.24.1, Vite 8.3.8, Rolldown 1.2.19, `@pnp/spfx-controls-react` 3.25.0. Date: 2026-11-16.

Files in this folder:

| File | What it is |
|---|---|
| spfx-lib-css.mjs | Prototype fix: a Vite plugin plus a Rolldown plugin for `optimizeDeps` |
| vite.config.mjs | Copy of the bench config. The bench's `.scss.css` hack is replaced by the prototype; only the sp-*/loc externals (F2) are kept. `NO_LIBCSS=1` turns the prototype off |
| compare-dist.mjs | Compiles all 64 pnp `.module.scss.css` files and compares them with the heft bundle `spfx-bench/dist/bench-pnp-web-part.js` |
| check-normal-path.mjs | Sends a pnp module through Vite's normal transform path (no pre-bundling) |
| check-property-controls.mjs | Shows what SPFx's module rule does to `@pnp/spfx-property-controls` CSS |
| `vite-baseline.log`, `vite-run1.log`, `vite-live.log`, `live-benchpnp.png` | Evidence |

Legend: **O** = observed (ran it), **S** = read in shipped code, **I** = inferred.

## 1. The shape of the problem

### `@pnp/spfx-controls-react` 3.25.0
- **83 JS files** in `lib/` use exactly one import form: `import styles from './X.module.scss'`. That is a default import, used as `styles.foo` (for example `PeoplePickerComponent.js:5` and `:312`, `styles.defaultClass`). There are no `require` calls and no named imports. **S**
- There are **64** `X.module.scss.css` files. The package ships no `.scss`, no `.module.scss.js` and no `.d.ts` for the styles. **S**
- The `.css` files are **Sass output with CSS modules not yet applied**. **S**
  - Class names are plain (`.defaultClass`, `.errorMessage`), not hashed. One literal `isSmall_88d29bd4` was copied from Fluent.
  - 21 files use `:global(...)` or `:global .x`. Loaded as plain CSS, those selectors are invalid and the browser drops the rules.
  - 4 files have ICSS `:export {}` blocks that the JS reads:
    - `GridLayout`: `padding: 20`, `minWidth`, …;
    - `ChartControl`: fonts and colours;
    - `RteColorPicker` and `RichTextPropertyPane`: theme tokens.
  - 25 files contain theme tokens in the quoted form `"[theme: x, default: y]"`.
  - Other contents: `@keyframes` (Carousel), `@media`, data: URLs, absolute `https://` URLs (FileTypeIcon, 110 KB).
- So the CSS must go through **CSS modules plus the theme-token loader**. The bench's current workaround (identity class map + `loadStyles(raw css)`) is wrong:
  - `:global(...)` rules break;
  - `:export` values are missing (`styles.padding` is `undefined`, so GridLayout gets `NaN`);
  - nothing is scoped.
  
  ListView and PeoplePicker happen to need none of these, which is why the bench looked fine.

### `@pnp/spfx-property-controls` 3.13.0 (older gulp toolchain, different shape)
- JS: `import styles from './X.module.scss'`. On disk there is `X.module.scss.js`, so Vite and webpack resolve it as `.js`.
- That file contains `require("./X.module.css"); var styles = { headerBar: 'headerBar_cee0aeea', … }; export default styles;`. The CSS is **already hashed**, with theme tokens.
- There is no `.module.scss.css` file, so the F1 failure doesn't apply. There is a separate problem, though: a CommonJS `require` of a `.module.css` inside an ES module.
  - SPFx 1.24's module rule (`/\.module(?:\.scss)?\.css$/i`) runs CSS modules over that `.module.css` again. It renames `headerBar_cee0aeea` to `headerBar_cee0aeea_8dfe1aa1` (see `check-property-controls.mjs`), while the JS uses the hard-coded map. So **under heft 1.24 these styles probably don't apply** (**I**: shown with the loader, not run under heft).
  - Vite's `.module.css` handling would rename the classes the same way.
  - The exact fix is: load it as **global** CSS (no modules) through the theme runtime. This is a separate item; the prototype doesn't handle it.
- `@pnp/modern-search-extensibility` 1.5.0 has no styles. Not checked further.

## 2. Root cause in Vite (O + S)
`node_modules/vite/dist/node/chunks/node.js`, `prepareRolldownOptimizerRun` and `rolldownDepPlugin`:
1. `vite:dep-pre-bundle-assets` matches `./X.module.scss` (the `scss` external type) and calls Vite's resolver. The file doesn't exist, so nothing is resolved.
2. Rolldown falls back to its own resolver, which Vite configures with `resolve.extensions: ['.tsx','.ts','.jsx','.js','.css','.json']`. It appends `.css` and finds `X.module.scss.css`.
3. `moduleTypes: { '.css': 'js' }`, so Rolldown parses the CSS as JS: `[PARSE_ERROR] Unexpected token` at `.defaultClass {`. Reproduced in `vite-baseline.log` with 3 errors: PeoplePickerComponent, ErrorMessage, DragDropFiles.

Plugins in `optimizeDeps.rolldownOptions.plugins` run **before** Vite's dep plugins (`plugins.push(...rolldownDepPlugin(...))` comes after the user plugins). An optimizer plugin can therefore claim these imports first.

## 3. How SPFx 1.24 handles it (S, confirmed by the byte comparison in section 5)
`@microsoft/spfx-heft-plugins/lib-esm/plugins/webpackConfigurationPlugin/WebpackConfigurationGenerator.js`, also visible in `../spfx-pipeline/artifacts/webpack-config-serve.json`. Nothing about this is specific to pnp:
1. **Resolution:** `resolve.extensions: ['.wasm','.mjs','.js','.json','.css','.jsx']`. webpack tries `X.module.scss` first, then appends each extension, so it finds `X.module.scss.css`. There is no alias and no special rule. (The rule `{test:/\.js$/, resolve:{fullySpecified:false}}` lets ESM `.js` use extensionless imports.) This is also how SPFx bundles **your own** `lib/*.js`: the Sass task writes `lib/X.module.scss.css` and the TypeScript output keeps `import styles from './X.module.scss'`. pnp just ships that same shape.
2. **Loader rules**, both `@microsoft/sp-css-loader` with `async: true`:
   - `test: options.cssModuleRuleTest ?? /\.module(?:\.scss)?\.css$/i` runs with `generateCssClassName`;
   - `test: options.cssGlobalRuleTest ?? /(?<!\.module(?:\.scss)?)\.css$/` runs without it (global CSS).
3. **sp-css-loader** (`lib-esm/index.js`) runs this PostCSS chain: `cssnano(default, calc:false)` → `autoprefixer('> 1%', 'ie >= 11')` → `postcss-modules-values` → `local-by-default(local)` → `extract-imports` → `modules-scope(generateScopedName)` → css-loader's `icssParser` / `importParser` / `urlParser` (data: URLs skipped). It emits:
   ```js
   import * as __LOAD_THEMED_STYLES__ from "<rel>/@microsoft/load-themed-styles/lib-es6/index.js";
   __LOAD_THEMED_STYLES__.loadStyles("<css>", true);
   export default { foo: "foo_<hash>", /* :export values */ padding: "20" };
   ```
4. **Class names:** `DEFAULT_GENERATE_CSS_CLASS_NAME = name + '_' + hmacSha1(key = absolute css path, data = css).hex.slice(0, 8)`. The hash is cached per file. Because the key is the absolute path, hashes differ between machines. The only thing that matters is that the CSS and the JS class map agree.
5. **Theme tokens:** they are left in the CSS string. `load-themed-styles` replaces them at runtime from `window.__themeState__.theme` and re-applies them when `loadTheme()` runs.

## 4. Proposed fix (prototype: spfx-lib-css.mjs)
Copy SPFx in both paths, **using sp-css-loader itself**. It is always installed as a dependency of `@microsoft/spfx-heft-plugins`. The prototype calls it with a minimal loader context and the same `generateCssClassName`.

```js
const PREFIX = '\0spfx-lib-css:', SUFFIX = '.js';       // ".js" so vite:css never treats the id as a stylesheet
const MODULE_CSS = /\.module(?:\.scss)?\.css$/i;         // SPFx cssModuleRuleTest

function resolveLibCss(source, importer) {               // webpack's ".css" extension fallback, JS importers only
  if (!importer || importer.startsWith('\0') || STYLE_RE.test(importer)) return null;
  if (!/\.(scss|sass|css)$/.test(source) || !(source.startsWith('.') || path.isAbsolute(source))) return null;
  const file = path.resolve(path.dirname(importer), source);
  return !fs.existsSync(file) && fs.existsSync(file + '.css') ? PREFIX + file + '.css' + SUFFIX : null;
}

async function load(id) {                                // the SPFx loader, verbatim
  if (!id.startsWith(PREFIX)) return null;
  const file = id.slice(PREFIX.length, -SUFFIX.length);
  return { code: await spCssLoader(file, {               // fake loader ctx: resourcePath, context, getOptions, async, getResolve
    async: true, production: false, loadThemedStylesImportPath: <abs path of sp-css-loader's load-themed-styles>,
    ...(MODULE_CSS.test(file) ? { generateCssClassName: hmacSha1Name } : {})
  }), moduleType: 'js' };
}

// Vite plugin (enforce: 'pre'): resolveId + load        -> normal path (linked / excluded libraries)
// config(): optimizeDeps.rolldownOptions.plugins: [{ name, resolveId, load }]   -> pre-bundling path
```

Design decisions:
- **Load the CSS as a JS module through `load-themed-styles`, not through Vite's CSS pipeline.** Reasons:
  1. The CSS and class map are byte-for-byte what heft produces.
  2. Inside pre-bundling, the module is **inlined into the optimized chunk**. With Vite's CSS pipeline, each of the 64 files would be a separate external request (Vite externalizes CSS from deps) that runs through `vite:css` on every cold load.
  3. Theming is the same mechanism as production: a `__themeState__` registration, re-applied on `loadTheme`. That covers runtime theme switches without the 500 ms poll in `themed-styles-runtime.js`.
  4. Vite wouldn't treat `X.module.scss.css` as a CSS module anyway: its `cssModuleRE` is `\.module\.(css|scss|…)(?:$|\?)`, and `.module.scss.css` doesn't match. Using Vite's pipeline would need an id hack such as `?x.module.css`, and Vite's PostCSS-modules setup differs from SPFx's (no cssnano or autoprefixer, a different hash).
- **What you give up:** HMR for these styles. `load-themed-styles` can't remove styles. For pre-bundled deps this doesn't matter, since node_modules don't change. For a **linked library being edited** (normal path), each change re-runs the module, adds a second `<style>` and leaves stale rules behind, though the new rules apply. If that becomes a need, the normal path could map to Vite's CSS pipeline (id ending in `.module.css`, then the existing `updateStyle` → themed runtime). That would have its own class hashes, but CSS and JS would still agree.
- **Fallback when sp-css-loader isn't resolvable:** first try the project root, then resolve through `@microsoft/spfx-heft-plugins` (strict pnpm layouts). A last-resort pure-PostCSS reimplementation is possible. Every dependency it needs (`postcss-modules-*`, `icss-utils`) comes with sp-css-loader, so this is unlikely to be needed.
- **Pre-bundling without Vite plugins:** this plugin doesn't touch the sp-*/loc externals. It will sit in the same `optimizeDeps.rolldownOptions.plugins` array as the planned externals plugin (F2) and the TLA facades ([../tla-externals/README.md](../tla-externals/README.md)). Order between them doesn't matter, because they match disjoint specifiers. Both must stay ahead of Vite's dep plugins, which is the default.
- Bench workaround to remove after adoption: `tools/vite-bench-workarounds.mjs` item (2). The `load()` that builds an identity map.

## 5. Verification

| Check | How | Result | Type |
|---|---|---|---|
| Baseline fails | `NO_LIBCSS=1 vite --force` | `PARSE_ERROR` ×3 (`vite-baseline.log`) | O |
| Pre-bundling succeeds without the bench `.scss.css` workaround | `vite --force` / `vite optimize` with this config | succeeds; `@pnp_spfx-controls-react_lib_{ListView,PeoplePicker}.js` contain `loadStyles(".DragDropFilesArea_520e7a5c…` and the maps for `b085a859` and `f9a54bd5` | O |
| Same CSS and class names as heft | `compare-dist.mjs` against `dist/bench-pnp-web-part.js` (heft dev bundle) | all 3 pnp style modules in that bundle (PeoplePickerComponent `b085a859`, ErrorMessage `f9a54bd5`, DragDropFiles `520e7a5c`): **CSS text identical** (heft only appends an inline source map) and **class maps identical**, hashes included | O |
| `:global`, `:export`, theme tokens compile | prototype output for StockImages / GridLayout / RteColorPicker / FileTypeIcon | `:global(.ms-Panel-main)` becomes `.ms-Panel-main`; `export default { padding: "20", minWidth: "210", … }`; tokens kept for runtime | O |
| Normal path (no pre-bundling) | `check-normal-path.mjs` | the pnp module's import is rewritten to `/@id/__x00__spfx-lib-css:…PeoplePickerComponent.module.scss.css.js`; it serves the SPFx JS module | O |
| Live: renders | SharePoint page with `?debugManifestsFile=https://localhost:4361/…` (headless Chrome, saved profile) | "Web: dev (29 lists)", ListView with 12 rows, PeoplePicker present; served from `.vite-cache/deps/@pnp_spfx-controls-react_lib_*.js`. Elements carry `defaultClass_b085a859` and `DragDropFilesAreaLeave_520e7a5c`; injected `<style data-load-themed-styles>` contains all 3 modules. Computed styles: `position: relative` (DragDrop) and `color: rgb(0,0,0)` (PeoplePicker), as the CSS defines | O (live) |
| Live: theme tokens | `import()` of the AnimatedDialog style module from the page (normal path), class applied to a test element | rule became `.animatedDialogTitleContainer_419eb575 i{color:#8764b8}`, the tenant `themePrimary` (#8764b8, not the default #0078d7); computed `rgb(135,100,184)`. RteColorPicker: `"[theme: white…]"` became `#FFFFFF` | O (live) |
| Computed styles compared live with `heft start` | — | not done. CSS and maps are byte-identical to the heft bundle instead, which is a stronger check for this question | — |
| Theme switch at runtime | — | not tested. Same `load-themed-styles` mechanism as production | I |

Seen in the console during the live run, none traced to this change:
- `Some icons were re-registered`: appears when Fluent icons are registered more than once;
- `OfficeBrowserFeedback …`: comes from SharePoint;
- two `Unhandled rejection`s: not investigated.

## 6. Other places that need the same resolution
1. **Pre-bundling** (`optimizeDeps.rolldownOptions.plugins`): required (this finding).
2. **The normal plugin pipeline** (`resolveId`/`load` in spfx-serve): for deps that aren't pre-bundled, such as `optimizeDeps.exclude`, linked or workspace SPFx libraries, and `@fs` sources. Same hooks.
3. **External discovery (F3):** if spfx-serve starts crawling dependency imports to find sp-* externals the way Heft does, the crawler must apply the same `.scss` → `.scss.css` rule. Otherwise it will report missing files.
4. **Generalization (optional):** webpack appends `.css` to *any* unresolved request. Only `.scss`/`.sass`/`.css` specifiers are handled here; `./foo` → `foo.css` hasn't been seen in practice. Bare specifiers such as `@pnp/x/lib/X.module.scss`, imported directly from user code, need a `this.resolve` of the package path first (not implemented).
5. **Sass `@import`/`@use` of library styles from user `.scss`:** **no change**. Heft's Sass task can't import a `.module.scss` that only exists as `.css` either, so failing in both tools is the same behaviour. The resolver skips style importers on purpose, as spfx-serve already does for externals.
6. **Plain `.css` imported from deps** (pnp: `toolbar.css`, `style.css`, `quill.snow.css`, `maplibre-gl.css`, `animate.css` via `require`): **already OK, by inference**. Vite externalizes them from pre-bundling and serves them as global CSS. spfx-serve's post-transform sends them through `themed-styles-runtime`. That matches SPFx's global-CSS rule. Not exercised live, because the bench doesn't use those controls.
7. **property-controls-style `require("./X.module.css")` of pre-hashed CSS:** a separate item (section 1). Exact SPFx parity would re-scope the classes and break them. Loading them as global CSS would fix it in Vite, and arguably in heft too.

## 7. State left behind
- No changes to `tools/vite-plugin-spfx-serve`, spfx-rea `src/`/`config/`/`package.json`, or the bench. The bench's own `node_modules/.vite` was not touched; experiments used `research/pnp-scss/.vite-cache` (gitignored).
- Vite on port 4361 and Chrome on port 9371 were stopped. Nothing was saved on the SharePoint page.
