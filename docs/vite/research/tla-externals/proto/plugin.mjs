// @ts-check
/**
 * vite-plugin-spfx-serve: a dev-only Vite server for SPFx web parts.
 *
 * It replaces `heft start` for local development against a real SharePoint page. Production builds
 * and packaging stay on Heft. Flow:
 *
 *   SharePoint (debug query string)
 *     -> GET /temp/build/manifests.js         generated debug manifests (from config/config.json)
 *     -> GET /@spfx/component/<id>.js         classic AMD shim: registers "<id>_<version>" with RequireJS
 *          - loads the @microsoft/sp-* externals through the component-scoped RequireJS (tenant versions)
 *          - import()s the web part entry from Vite as native ESM
 *     -> /src/**                              transformed on demand by Vite, with HMR + React Fast Refresh
 *
 * React/ReactDOM are deliberately NOT taken from the page in dev: the tenant ships production React,
 * which cannot do Fast Refresh. The web part uses the development React from node_modules instead.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { init as initLexer, parse as parseModule } from 'es-module-lexer';

const PLUGIN = 'spfx-serve-tla';
// Experiment switches (env):
//   TLA_MANIFEST = used (default: libraries imported by src) | all (every SPFx library in node_modules) | none
//   TLA_PRELOAD  = 1 to also preload the manifest externals in the shim (old behaviour), default 0
//   TLA_PROBE    = 1 to import research/tla-externals/proto/probe.ts after the entry
const MANIFEST_MODE = process.env.TLA_MANIFEST || 'used';
const PRELOAD = process.env.TLA_PRELOAD === '1';
const PROBE = process.env.TLA_PROBE === '1';
const MANIFESTS_URL = '/temp/build/manifests.js';
const SHIM_PREFIX = '/@spfx/component/';
const ENTRY_PREFIX = '/@spfx-entry/';
const VIRTUAL_EXTERNAL = '\0spfx-external:';
const VIRTUAL_LOC = '\0spfx-loc:';
const VIRTUAL_ENTRY = '\0spfx-entry:';
const THEMED_STYLES_ID = 'virtual:spfx-themed-styles';
const VIRTUAL_THEMED_STYLES = '\0' + THEMED_STYLES_ID;
const THEMED_STYLES_URL = '/@id/__x00__' + THEMED_STYLES_ID;
const RUNTIME_FILE = fileURLToPath(new URL('./themed-styles-runtime.js', import.meta.url));
const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];
const STYLE_REQUEST = /\.(css|scss|sass|less|styl|stylus|pcss|postcss)(\?|$)/;

/**
 * @typedef {object} SpfxServeOptions
 * @property {string} [pageUrl]   SharePoint page to print with the debug query string.
 *                                Defaults to config/serve.json `initialPage` ({tenantDomain} from SPFX_SERVE_TENANT_DOMAIN).
 * @property {string} [locale]    Locale used for `localizedResources` (default "en-us").
 * @property {number} [port]      Defaults to config/serve.json `port` (4321).
 */

/**
 * @param {SpfxServeOptions} [options]
 * @returns {import('vite').Plugin}
 */
export default function spfxServe(options = {}) {
  /** @type {string} */ let root = process.cwd();
  /** @type {ReturnType<typeof createProject>} */ let project;

  return {
    name: PLUGIN,
    apply: 'serve',
    enforce: 'pre',

    config(userConfig) {
      root = path.resolve(userConfig.root || process.cwd());
      project = createProject(root, options);
      const { port, origin } = project;
      return {
        appType: 'custom',
        server: {
          host: 'localhost',
          port,
          strictPort: true,
          origin,
          https: loadDevCertificate(),
          cors: { origin: true },
          headers: { 'Access-Control-Allow-Private-Network': 'true' },
          watch: {
            ignored: ['**/lib/**', '**/lib-commonjs/**', '**/lib-esm/**', '**/lib-dts/**', '**/dist/**', '**/temp/**',
              '**/release/**', '**/sharepoint/**', '**/jest-output/**', '**/.heft/**']
          }
        },
        optimizeDeps: {
          // Third-party deps that import @microsoft/sp-* get the same TLA facade inlined into the pre-bundle,
          // so the dep shares the page's instance instead of bundling a second copy.
          rolldownOptions: {
            plugins: [{
              name: PLUGIN + ':deps',
              resolveId(/** @type {string} */ source) {
                return project.externals().has(source) ? VIRTUAL_EXTERNAL + source : null;
              },
              async load(/** @type {string} */ id) {
                if (!id.startsWith(VIRTUAL_EXTERNAL)) return null;
                const pkg = id.slice(VIRTUAL_EXTERNAL.length);
                return renderExternalModule(pkg, await project.exportNames(pkg));
              }
            }]
          },
          entries: project.listComponents().map((c) => c.entryFile),
          include: ['react', 'react-dom', 'react-dom/client', 'react/jsx-dev-runtime', 'react/jsx-runtime']
        },
        resolve: {
          // SPFx/webpack style "~package/..." imports in Sass.
          alias: [{ find: /^~(?=[@\w])/, replacement: '' }]
        },
        css: {
          devSourcemap: true,
          modules: { localsConvention: 'camelCase', generateScopedName: '[local]_[hash:base64:8]' }
        },
        define: { DEBUG: 'true' }
      };
    },

    configureServer(server) {
      const reloadOnChange = (/** @type {string} */ file) => {
        if (project.isConfigFile(file)) {
          project.invalidate();
          server.config.logger.info(`[${PLUGIN}] ${path.relative(root, file)} changed, reloading page`, { timestamp: true });
          server.ws.send({ type: 'full-reload' });
        }
      };
      server.watcher.add(project.configFiles());
      server.watcher.on('change', reloadOnChange);
      server.watcher.on('add', reloadOnChange);

      server.middlewares.use((req, res, next) => {
        const url = (req.url || '').split('?')[0];
        try {
          if (url === MANIFESTS_URL) {
            return sendJs(res, renderManifestsModule(project.debugManifests()));
          }
          if (url.startsWith(SHIM_PREFIX) && url.endsWith('.js')) {
            const id = url.slice(SHIM_PREFIX.length, -3);
            const component = project.listComponents().find((c) => c.manifest.id === id);
            if (component) return sendJs(res, renderShim(project, component));
          }
        } catch (error) {
          server.config.logger.error(`[${PLUGIN}] ${/** @type {Error} */ (error).stack}`);
          res.statusCode = 500;
          return res.end(String(error));
        }
        next();
      });

      server.httpServer?.once('listening', () => {
        const page = project.pageUrl();
        const debugQuery = `debugManifestsFile=${encodeURIComponent(project.origin + MANIFESTS_URL)}&debug=true&noredir=true`;
        const names = project.listComponents().map((c) => c.manifest.alias).join(', ');
        server.config.logger.info(
          `\n  [${PLUGIN}] web parts: ${names}\n` +
          (page
            ? `  [${PLUGIN}] open: ${page}${page.includes('?') ? '&' : '?'}${debugQuery}\n`
            : `  [${PLUGIN}] append to your SharePoint page URL: ?${debugQuery}\n`)
        );
      });
    },

    resolveId(source, importer) {
      if (source === THEMED_STYLES_ID) return VIRTUAL_THEMED_STYLES;
      if (source.startsWith(ENTRY_PREFIX)) return VIRTUAL_ENTRY + source.slice(ENTRY_PREFIX.length);
      // Only JS imports of the exact package name are externals (Sass "~@microsoft/sp-.../x.scss" must still resolve).
      if (importer && STYLE_REQUEST.test(importer)) return null;
      if (project.externals().has(source)) return VIRTUAL_EXTERNAL + source;
      if (project.localizedResources().has(source)) return VIRTUAL_LOC + source;
      return null;
    },

    async load(id) {
      if (id === VIRTUAL_THEMED_STYLES) {
        this.addWatchFile(RUNTIME_FILE);
        return fs.readFileSync(RUNTIME_FILE, 'utf8');
      }
      if (id.startsWith(VIRTUAL_ENTRY)) {
        const component = project.listComponents().find((c) => c.manifest.id === id.slice(VIRTUAL_ENTRY.length));
        if (!component) return null;
        const entry = '/' + toPosix(path.relative(root, component.entryFile));
        return [
          // Fast Refresh preamble must run before react-dom is evaluated (SharePoint hosts the page, not index.html).
          `import '@vitejs/plugin-react/preamble';`,
          `export * from ${JSON.stringify(entry)};`,
          `export { default } from ${JSON.stringify(entry)};`,
          // Changes that no React component accepts (e.g. the web part class) end up here.
          `if (import.meta.hot) import.meta.hot.accept(() => location.reload());`,
          ...(PROBE ? [`setTimeout(() => import('/research/tla-externals/proto/probe.ts').then((p) => p.run()).then(`
            + `(r) => { window.__tlaProbe = r; }, (e) => { window.__tlaProbe = { error: String(e && e.stack || e) }; }), 0);`] : [])
        ].join('\n');
      }
      if (id.startsWith(VIRTUAL_EXTERNAL)) {
        const pkg = id.slice(VIRTUAL_EXTERNAL.length);
        return renderExternalModule(pkg, await project.exportNames(pkg));
      }
      if (id.startsWith(VIRTUAL_LOC)) {
        const file = project.localizedResources().get(id.slice(VIRTUAL_LOC.length));
        if (!file) return null;
        this.addWatchFile(file);
        return renderLocModule(file);
      }
      return null;
    },

    transform: {
      order: 'post',
      handler(code, id) {
        // Vite's dev CSS modules call updateStyle() from /@vite/client; route them through the theme-token runtime.
        // This runs after import analysis, so emit the final browser URL of the virtual module.
        if (!STYLE_REQUEST.test(id) || !code.includes('__vite__updateStyle')) return null;
        const replaced = code.replace(
          /(import \{ updateStyle as __vite__updateStyle, removeStyle as __vite__removeStyle \} from )"[^"]*"/,
          `$1${JSON.stringify(THEMED_STYLES_URL)}`
        );
        return replaced === code ? null : { code: replaced, map: null };
      }
    }
  };
}

// ---------------------------------------------------------------------------------------------
// Project model (config/config.json, source manifests, package.json, node_modules SPFx libraries)
// ---------------------------------------------------------------------------------------------

/**
 * @param {string} root
 * @param {SpfxServeOptions} options
 */
function createProject(root, options) {
  const serveConfig = readJsonc(path.join(root, 'config/serve.json'), {});
  const port = options.port || serveConfig.port || 4321;
  const origin = `https://localhost:${port}`;
  const locale = (options.locale || 'en-us').toLowerCase();
  const requireFromRoot = createRequire(path.join(root, 'package.json'));

  /** @type {Map<string, any>} */
  const cache = new Map();
  /** @type {Map<string, string[]>} */
  const exportNamesCache = new Map();
  const memo = (/** @type {string} */ key, /** @type {() => any} */ fn) => {
    if (!cache.has(key)) cache.set(key, fn());
    return cache.get(key);
  };

  const packageJson = () => memo('package', () => readJsonc(path.join(root, 'package.json')));
  const buildConfig = () => memo('config', () => readJsonc(path.join(root, 'config/config.json')));

  /** Maps a Heft output path (lib/foo.js) back to its source (src/foo.ts[x]). */
  const libToSource = (/** @type {string} */ libPath, /** @type {string[]} */ extensions) => {
    const relative = toPosix(libPath).replace(/^\.\//, '').replace(/^lib\//, 'src/').replace(/\.js$/, '');
    for (const ext of extensions) {
      const candidate = path.join(root, relative + ext);
      if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`[${PLUGIN}] cannot find source for "${libPath}" (tried ${relative}{${extensions.join(',')}})`);
  };

  /** @returns {{ bundle: string, manifest: any, entryFile: string, manifestFile: string }[]} */
  const listComponents = () => memo('components', () => {
    const version = packageJson().version;
    const config = buildConfig();
    if (config.externals && Object.keys(config.externals).length) {
      console.warn(`[${PLUGIN}] config/config.json "externals" are not supported yet and are ignored`);
    }
    const result = [];
    for (const [bundle, { components = [] }] of Object.entries(config.bundles || {})) {
      for (const component of components) {
        const manifestFile = path.join(root, component.manifest);
        const manifest = readJsonc(manifestFile);
        if (manifest.componentType !== 'WebPart') {
          console.warn(`[${PLUGIN}] ${manifest.alias}: componentType "${manifest.componentType}" is not supported yet, skipped`);
          continue;
        }
        if (!manifest.version || manifest.version === '*') manifest.version = version;
        result.push({ bundle, manifest, manifestFile, entryFile: libToSource(component.entrypoint, SOURCE_EXTENSIONS) });
      }
    }
    return result;
  });

  /** Packages from package.json dependencies that ship an SPFx Library component manifest. */
  const libraryComponents = () => memo('libraries', () => {
    /** @type {Map<string, { id: string, version: string }>} */
    const libraries = new Map();
    const msDir = path.join(root, 'node_modules/@microsoft');
    const candidates = new Set(Object.keys(packageJson().dependencies || {}));
    if (fs.existsSync(msDir)) for (const d of fs.readdirSync(msDir)) candidates.add('@microsoft/' + d);
    for (const name of candidates) {
      let packageDir;
      try {
        packageDir = path.dirname(requireFromRoot.resolve(`${name}/package.json`));
      } catch {
        packageDir = path.join(root, 'node_modules', name);
      }
      const distDir = path.join(packageDir, 'dist');
      if (!fs.existsSync(distDir)) continue;
      for (const file of fs.readdirSync(distDir)) {
        if (!file.endsWith('.manifest.json')) continue;
        const manifest = readJsonc(path.join(distDir, file));
        if (manifest.componentType === 'Library' && manifest.id && manifest.version) {
          libraries.set(name, { id: manifest.id, version: manifest.version });
          break;
        }
      }
    }
    return libraries;
  });

  /** SPFx libraries actually imported somewhere in src (what Heft's webpack would have discovered). */
  const usedExternals = () => memo('usedExternals', () => {
    const libraries = libraryComponents();
    const used = new Set();
    for (const file of walk(path.join(root, 'src'))) {
      if (!SOURCE_EXTENSIONS.includes(path.extname(file))) continue;
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(/(?:from\s*|import\s*\(?\s*|require\s*\(\s*)['"]([^'"]+)['"]/g)) {
        if (libraries.has(match[1])) used.add(match[1]);
      }
    }
    return used;
  });

  /** @returns {Map<string, string>} localized resource module name -> source file for the configured locale */
  const localizedResources = () => memo('loc', () => {
    const map = new Map();
    for (const [name, pattern] of Object.entries(buildConfig().localizedResources || {})) {
      const libPath = String(pattern).replace('{locale}', locale);
      try {
        map.set(name, libToSource(libPath, ['.js', '.ts']));
      } catch {
        map.set(name, libToSource(String(pattern).replace('{locale}', 'en-us'), ['.js', '.ts']));
        console.warn(`[${PLUGIN}] ${name}: no "${locale}" strings, using en-us`);
      }
    }
    return map;
  });

  const debugManifests = () => {
    const libraries = libraryComponents();
    const externals = MANIFEST_MODE === 'all' ? [...libraries.keys()].sort()
      : MANIFEST_MODE === 'none' ? [] : [...usedExternals()].sort();
    return listComponents().map(({ bundle, manifest }) => ({
      ...manifest,
      loaderConfig: {
        internalModuleBaseUrls: [origin + '/'],
        entryModuleId: bundle,
        scriptResources: {
          [bundle]: { type: 'path', path: `${SHIM_PREFIX.slice(1)}${manifest.id}.js` },
          ...Object.fromEntries(externals.map((name) => [name, { type: 'component', ...libraries.get(name) }]))
        }
      }
    }));
  };

  return {
    port,
    origin,
    listComponents,
    debugManifests,
    localizedResources,
    externals: () => new Set(libraryComponents().keys()),
    // TLA_BREAK=<pkg>: pretend the project needs a version the tenant doesn't have (error-reporting test)
    libraryTable: () => Object.fromEntries([...libraryComponents()].map(([k, v]) =>
      [k, k === process.env.TLA_BREAK ? { ...v, version: '9.0.0' } : v])),
    manifestExternals: () => MANIFEST_MODE === 'all' ? [...libraryComponents().keys()].sort()
      : MANIFEST_MODE === 'none' ? [] : [...usedExternals()].sort(),
    usedExternals: () => [...usedExternals()].sort(),
    /** @param {string} pkg */
    async exportNames(pkg) {
      if (!exportNamesCache.has(pkg)) exportNamesCache.set(pkg, await readExportNames(requireFromRoot, pkg));
      return /** @type {string[]} */ (exportNamesCache.get(pkg));
    },
    pageUrl() {
      if (options.pageUrl) return options.pageUrl;
      const initial = serveConfig.initialPage;
      const tenant = process.env.SPFX_SERVE_TENANT_DOMAIN;
      if (!initial || (initial.includes('{tenantDomain}') && !tenant)) return undefined;
      return initial.replace('{tenantDomain}', tenant || '');
    },
    configFiles: () => [
      path.join(root, 'package.json'),
      path.join(root, 'config/config.json'),
      ...listComponents().map((c) => c.manifestFile)
    ],
    /** @param {string} file */
    isConfigFile(file) {
      const normalized = path.resolve(file);
      return normalized.endsWith('.manifest.json') && normalized.startsWith(path.join(root, 'src'))
        || normalized === path.join(root, 'package.json')
        || normalized === path.join(root, 'config/config.json');
    },
    invalidate: () => cache.clear(),
    // New imports of SPFx libraries change the manifest, so rescan on every manifests request.
    rescanImports: () => cache.delete('usedExternals')
  };
}

// ---------------------------------------------------------------------------------------------
// Generated modules
// ---------------------------------------------------------------------------------------------

/** @param {any[]} manifests */
function renderManifestsModule(manifests) {
  return `define([], function () {\n  var manifests = ${JSON.stringify(manifests, null, 2)};\n  return { getManifests: function () { return manifests; } };\n});\n`;
}

/**
 * Classic (non-module) script that SharePoint's RequireJS loads for the component.
 * TLA variant: it only captures the component-scoped RequireJS `require` and installs
 * window.__spfxVite.require(name) -> Promise<module>. The facades await it (top-level await).
 * @param {ReturnType<typeof createProject>} project
 * @param {{ manifest: any }} component
 */
function renderShim(project, { manifest }) {
  project.rescanImports();
  const moduleId = `${manifest.id}_${manifest.version}`;
  const loaderPlugin = `spfx-vite-loader-${manifest.id}`;
  const preload = PRELOAD ? project.manifestExternals() : [];
  return `/* ${PLUGIN}: dev shim for ${manifest.alias} */
(function () {
  var sv = window.__spfxVite || (window.__spfxVite = { log: [], cache: {} });
  sv.libraries = ${JSON.stringify(project.libraryTable())};
  sv.manifestExternals = ${JSON.stringify(project.manifestExternals())};
  function t() { return Math.round(performance.now()); }
  function amd() { return window.requirejs || window.require; }
  // id -> versions already defined in the page's RequireJS (no network)
  sv.definedVersions = function (id) {
    var defined = amd().s.contexts._.defined, out = [];
    for (var k in defined) if (k.indexOf(id + '_') === 0) out.push(k.slice(id.length + 1));
    return out;
  };
  sv.strategies = {
    // 1. component-scoped require: RequireJS map (manifest scriptResources) -> tenant version
    scoped: function (name) {
      return new Promise(function (resolve, reject) { sv.componentRequire([name], resolve, reject); });
    },
    // 2. SPComponentLoader.loadComponentById(id, version) with our own id/version from node_modules
    byId: function (name) {
      var lib = sv.libraries[name];
      if (!lib) return Promise.reject(new Error('no SPFx library manifest for ' + name));
      return sv.loader().then(function (L) { return L.SPComponentLoader.loadComponentById(lib.id, lib.version); });
    },
    // 3. global require('<id>_<version>') for an already defined module, picking the highest same-major version
    global: function (name) {
      var lib = sv.libraries[name];
      if (!lib) return Promise.reject(new Error('no SPFx library manifest for ' + name));
      var major = lib.version.split('.')[0];
      var v = sv.definedVersions(lib.id).filter(function (x) { return x.split('.')[0] === major; })
        .sort(function (a, b) { return a.localeCompare(b, undefined, { numeric: true }); }).pop();
      if (!v) return Promise.reject(new Error(name + ' (' + lib.id + ') is not defined in the page'));
      return Promise.resolve(amd()(lib.id + '_' + v));
    }
  };
  sv.loader = function () {
    if (sv.manifestExternals.indexOf('@microsoft/sp-loader') >= 0) return sv.strategies.scoped('@microsoft/sp-loader');
    return sv.strategies.global('@microsoft/sp-loader');
  };
  // what the facades call
  sv.require = sv.require || function (name) {
    if (sv.cache[name]) return sv.cache[name];
    var start = t();
    var how = sv.manifestExternals.indexOf(name) >= 0 ? 'scoped' : (sv.fallback || 'byId');
    var p = sv.strategies[how](name).then(function (m) {
      sv.log.push({ name: name, how: how, start: start, end: t() });
      return m;
    }, function (error) {
      sv.log.push({ name: name, how: how, start: start, end: t(), error: String(error && error.message || error) });
      var e = new Error('[${PLUGIN}] cannot load SPFx library "' + name + '" (' + how + '): ' + (error && error.message || error));
      e.cause = error;
      console.error(e);
      throw e;
    });
    return (sv.cache[name] = p);
  };
})();
define(${JSON.stringify(loaderPlugin)}, [], function () {
  return {
    load: function (name, componentRequire, onload) {
      var sv = window.__spfxVite;
      sv.componentRequire = sv.componentRequire || componentRequire;
      sv.componentId = sv.componentId || ${JSON.stringify(moduleId)};
      var preload = ${JSON.stringify(preload)};
      var go = function () {
        sv.importStart = Math.round(performance.now());
        import(${JSON.stringify(project.origin)} + name).then(function (m) {
          sv.importEnd = Math.round(performance.now());
          onload(m);
        }, function (error) {
          console.error('[${PLUGIN}] failed to load ${manifest.alias} from Vite', error);
          onload.error(error);
        });
      };
      if (preload.length) componentRequire(preload, go, function (error) { onload.error(error); });
      else go();
    }
  };
});
define(${JSON.stringify(moduleId)}, [${JSON.stringify(`${loaderPlugin}!${ENTRY_PREFIX}${manifest.id}`)}], function (entry) {
  return entry;
});
`;
}

/**
 * ESM facade for an SPFx library, loaded on demand with top-level await.
 * @param {string} pkg
 * @param {string[]} names
 */
function renderExternalModule(pkg, names) {
  const lines = [
    `const m = await window.__spfxVite.require(${JSON.stringify(pkg)});`,
    `export default (m.default !== undefined ? m.default : m);`
  ];
  names.forEach((name, i) => {
    lines.push(`const __e${i} = m[${JSON.stringify(name)}];`, `export { __e${i} as ${name} };`);
  });
  return lines.join('\n');
}

/** Localized strings: SPFx loc files are AMD `define([], function () { return {...}; })`. @param {string} file */
function renderLocModule(file) {
  const code = fs.readFileSync(file, 'utf8');
  /** @type {any} */ let strings;
  const define = (/** @type {any[]} */ ...args) => {
    const factory = args.find((a) => typeof a === 'function');
    strings = factory ? factory() : args.find((a) => a && typeof a === 'object' && !Array.isArray(a));
  };
  new Function('define', code)(define);
  const keys = Object.keys(strings || {}).filter(isIdentifier);
  return [
    `const strings = ${JSON.stringify(strings || {}, null, 2)};`,
    `export default strings;`,
    ...keys.map((k, i) => `const __s${i} = strings[${JSON.stringify(k)}];\nexport { __s${i} as ${k} };`),
    `if (import.meta.hot) import.meta.hot.accept(() => location.reload());`
  ].join('\n');
}

// ---------------------------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------------------------

/** Named exports of a package: ESM entry (following `export *`), falling back to requiring it in Node. */
async function readExportNames(/** @type {NodeRequire} */ requireFromRoot, /** @type {string} */ pkg) {
  await initLexer;
  /** @type {Set<string>} */ const names = new Set();
  const visit = (/** @type {string} */ file, /** @type {Set<string>} */ seen) => {
    if (seen.has(file) || !fs.existsSync(file)) return;
    seen.add(file);
    const source = fs.readFileSync(file, 'utf8');
    const [imports, exports] = parseModule(source);
    exports.forEach((e) => names.add(e.n));
    for (const imp of imports) {
      const statement = source.slice(imp.ss, imp.se);
      if (/^export\s*\*\s*from/.test(statement) && imp.n && imp.n.startsWith('.')) {
        let target = path.resolve(path.dirname(file), imp.n);
        if (!path.extname(target)) target += '.js';
        visit(target, seen);
      }
    }
  };
  try {
    const pkgJsonPath = requireFromRoot.resolve(`${pkg}/package.json`);
    const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const esmEntry = pkgJson.module || (pkgJson.exports && pkgJson.exports['.'] && pkgJson.exports['.'].import);
    if (esmEntry) visit(path.join(path.dirname(pkgJsonPath), esmEntry), new Set());
  } catch { /* fall through */ }
  if (names.size === 0) {
    // e.g. @microsoft/sp-lodash-subset ships an AMD blob in its "ESM" folder.
    try { Object.keys(requireFromRoot(pkg)).forEach((n) => names.add(n)); } catch (error) {
      console.warn(`[${PLUGIN}] cannot read exports of ${pkg}: ${/** @type {Error} */ (error).message}`);
    }
  }
  names.delete('default');
  return [...names].filter(isIdentifier).sort();
}

function loadDevCertificate() {
  const dir = path.join(os.homedir(), '.rushstack');
  const keyFile = path.join(dir, 'rushstack-serve.key');
  const certFile = path.join(dir, 'rushstack-serve.pem');
  if (!fs.existsSync(keyFile) || !fs.existsSync(certFile)) {
    throw new Error(`[${PLUGIN}] SPFx dev certificate not found in ${dir}. Run "npx heft trust-dev-cert" once.`);
  }
  return { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) };
}

/** @param {import('node:http').ServerResponse} res @param {string} code */
function sendJs(res, code) {
  res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(code);
}

/** JSON with comments (SPFx manifests use them). @param {string} file @param {any} [fallback] */
function readJsonc(file, fallback) {
  if (fallback !== undefined && !fs.existsSync(file)) return fallback;
  const text = fs.readFileSync(file, 'utf8');
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++) if (text[i] === '\\') i++;
      out += text.slice(start, i + 1);
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else {
      out += c;
    }
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

/** @param {string} dir @returns {Generator<string>} */
function* walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

/** @param {string} name */
function isIdentifier(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name);
}

/** @param {string} p */
function toPosix(p) {
  return p.split(path.sep).join('/');
}
