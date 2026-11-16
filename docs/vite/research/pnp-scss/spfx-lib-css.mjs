// @ts-check
/**
 * Prototype: SPFx-compatible handling of precompiled library styles.
 *
 * SPFx libraries (e.g. @pnp/spfx-controls-react) ship `lib/X.js` with `import styles from './X.module.scss'`
 * but only `lib/X.module.scss.css` on disk (Sass output, CSS-modules NOT yet applied: `:global(...)`, `:export {}`,
 * plain class names, theme tokens). SPFx's webpack finds the file through `resolve.extensions` (".css" appended)
 * and runs it through @microsoft/sp-css-loader:
 *   /\.module(?:\.scss)?\.css$/i  -> postcss(cssnano, autoprefixer, modules-values, local-by-default, extract-imports,
 *                                    modules-scope(generateScopedName = `${name}_${hmacSha1(file, css).slice(0,8)}`), icss)
 *                                    -> JS: loadStyles(css, true) from @microsoft/load-themed-styles; export default {classes, :export values}
 *   other .css                     -> same without the modules plugins (global CSS)
 *
 * This file reproduces that: same resolution rule + same loader (sp-css-loader itself, called with a minimal loader context).
 * Use `spfxLibCss()` as a Vite plugin (normal resolve path) AND `spfxLibCssRolldown()` in optimizeDeps.rolldownOptions.plugins.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const PREFIX = '\0spfx-lib-css:';
// Suffix ".js" so Vite's CSS plugin (CSS_LANGS_RE: /\.(css|...)(?:$|\?)/) never treats the id as a stylesheet.
const SUFFIX = '.js';
const MODULE_CSS = /\.module(?:\.scss)?\.css$/i; // = SPFx cssModuleRuleTest default

/** Same as DEFAULT_GENERATE_CSS_CLASS_NAME in @microsoft/spfx-heft-plugins WebpackConfigurationGenerator. */
const hashCache = new Map();
function generateCssClassName(name, file, css) {
  let hash = hashCache.get(file);
  if (!hash) {
    hash = crypto.createHmac('sha1', file).update(css).digest('hex').substring(0, 8);
    hashCache.set(file, hash);
  }
  return `${name}_${hash}`;
}

/**
 * webpack-style extension fallback, limited to what the SPFx config can produce for style imports:
 * `./X.module.scss` (missing) -> `./X.module.scss.css` (present). Only relative/absolute specifiers.
 * @param {string} source @param {string|undefined} importer
 */
export function resolveLibCss(source, importer) {
  if (!importer || importer.startsWith('\0')) return null;
  // JS importers only: Sass/CSS @import keep their own resolution (heft's Sass doesn't do this either).
  if (/\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?|$)/.test(importer)) return null;
  if (!/\.(scss|sass|css)$/.test(source.split('?')[0])) return null;
  if (!(source.startsWith('.') || path.isAbsolute(source))) return null;
  const file = path.resolve(path.dirname(importer.split('?')[0]), source);
  if (fs.existsSync(file) || !fs.existsSync(file + '.css')) return null;
  return PREFIX + file + '.css' + SUFFIX;
}

/** @param {string} root project root (where @microsoft/sp-css-loader is installed) */
export { createCompiler as createCompilerForTest };
function createCompiler(root) {
  const req = createRequire(path.join(root, 'package.json'));
  // Hoisted (npm) or, with strict layouts (pnpm), through the package that depends on it.
  let loaderPath;
  try {
    loaderPath = req.resolve('@microsoft/sp-css-loader');
  } catch {
    loaderPath = createRequire(req.resolve('@microsoft/spfx-heft-plugins/package.json')).resolve('@microsoft/sp-css-loader');
  }
  const loader = req(loaderPath).default;
  const ltsPkg = createRequire(loaderPath).resolve('@microsoft/load-themed-styles/package.json');
  const loadThemedStylesImportPath = path.join(path.dirname(ltsPkg), 'lib-es6', 'index.js').split(path.sep).join('/');

  /** @param {string} file absolute path of the .css file @returns {Promise<string>} JS module */
  return (file) => new Promise((resolve, reject) => {
    const isModule = MODULE_CSS.test(file);
    /** minimal webpack loader context used by sp-css-loader */
    const ctx = {
      resourcePath: file,
      context: path.dirname(file),
      rootContext: root,
      sourceMap: false,
      // only used for ICSS `:import`/`composes: x from './y.css'` (none in the surveyed packages): plain path resolution
      getResolve: () => async (context, request) => path.resolve(context, request),
      getOptions: () => ({
        async: true,
        production: false,
        loadThemedStylesImportPath,
        ...(isModule ? { generateCssClassName } : {})
      }),
      emitWarning: (w) => console.warn(`[spfx-lib-css] ${file}: ${w && w.message || w}`),
      async: () => (err, result) => (err ? reject(err) : resolve(result))
    };
    loader.call(ctx, fs.readFileSync(file, 'utf8'), undefined);
  });
}

function hooks(root) {
  let compile;
  return {
    resolveId(source, importer) {
      return resolveLibCss(source, importer);
    },
    async load(id) {
      if (!id.startsWith(PREFIX)) return null;
      const file = id.slice(PREFIX.length, -SUFFIX.length);
      compile ||= createCompiler(root);
      return { code: await compile(file), moduleType: 'js' };
    }
  };
}

/** Rolldown plugin for optimizeDeps.rolldownOptions.plugins (runs before Vite's own dep plugins). */
export function spfxLibCssRolldown(root = process.cwd()) {
  return { name: 'spfx-lib-css:optimizer', ...hooks(root) };
}

/** Vite plugin for the normal (non-pre-bundled) path; also registers the optimizer plugin. */
export default function spfxLibCss() {
  let root = process.cwd();
  /** @type {ReturnType<typeof hooks>} */ let h;
  return {
    name: 'spfx-lib-css',
    enforce: 'pre',
    config(userConfig) {
      root = path.resolve(userConfig.root || process.cwd());
      h = hooks(root);
      return { optimizeDeps: { rolldownOptions: { plugins: [spfxLibCssRolldown(root)] } } };
    },
    resolveId(source, importer) { return h.resolveId(source, importer); },
    async load(id) {
      const r = await h.load(id);
      if (r) this.addWatchFile(id.slice(PREFIX.length, -SUFFIX.length));
      return r;
    }
  };
}
