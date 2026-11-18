// Bench-only workarounds for things the (unmodified) spfx-serve PoC plugin doesn't handle yet.
// Each one is a finding for the plugin; see research/benchmark/README.md in spfx-rea.
import fs from 'node:fs';
import path from 'node:path';

const SP_EXTERNAL = /^@microsoft\/sp-[a-z-]+$/;

/**
 * @param {{ localizedResources: string[] }} options names of config.json localizedResources (e.g. ControlStrings)
 * @returns {import('vite').Plugin}
 */
export default function benchWorkarounds({ localizedResources }) {
  const locNames = new Set(localizedResources);

  // (1) Dependency pre-bundling (Rolldown) doesn't run Vite plugins, so without this it would
  //     - bundle a second copy of @microsoft/sp-* (pnp's nested 1.23 copies) into the optimized chunk;
  //     - fail on bare `import * as strings from 'ControlStrings'` (a config.json localizedResource).
  //     Leaving them external keeps the bare import in the optimized file; Vite's import analysis then
  //     resolves it through spfx-serve (facade over the tenant's module / loc module).
  // (2) @pnp/spfx-controls-react ships `import styles from './X.module.scss'` while the file on disk is the
  //     precompiled `X.module.scss.css` (webpack finds it through resolve.extensions + sp-css-loader).
  //     Load it as a JS module: inject with load-themed-styles (theme tokens) and export identity class names.
  const optimizerPlugin = {
    name: 'bench:optimizer-spfx',
    resolveId(source, importer) {
      if (SP_EXTERNAL.test(source) || locNames.has(source)) return { id: source, external: true };
      if (importer && /\.module\.scss$/.test(source) && importer.includes('node_modules')) {
        const file = path.resolve(path.dirname(importer), source);
        if (!fs.existsSync(file) && fs.existsSync(file + '.css')) return file + '.css?spfx-css-module';
      }
      return null;
    },
    load(id) {
      if (!id.endsWith('?spfx-css-module')) return null;
      const css = fs.readFileSync(id.replace(/\?spfx-css-module$/, ''), 'utf8');
      const classes = {};
      for (const m of css.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) classes[m[1]] = m[1];
      return `import { loadStyles } from '@microsoft/load-themed-styles';\nloadStyles(${JSON.stringify(css)});\nexport default ${JSON.stringify(classes)};\n`;
    }
  };

  return {
    name: 'bench:workarounds',
    apply: 'serve',
    config() {
      return {
        resolve: {
          // (3) @pnp/spfx-controls-react depends on react@17.0.1 (nested copy). Without dedupe the pre-bundled pnp
          //     chunk gets its own React 17 next to the dev React 18 -> invalid hook call.
          dedupe: ['react', 'react-dom']
        },
        optimizeDeps: {
          rolldownOptions: { plugins: [optimizerPlugin] }
        }
      };
    }
  };
}
