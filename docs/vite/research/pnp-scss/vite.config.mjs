// Experimental copy of spfx-bench/vite.config.mjs: bench workarounds minus the .module.scss.css hack,
// replaced by ./spfx-lib-css.mjs. Run: (cd /home/sergei/Projects/spfx-bench && npx vite --config ../spfx-rea/research/pnp-scss/vite.config.mjs)
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import spfxServe from '../../tools/vite-plugin-spfx-serve/index.mjs';
import spfxLibCss from './spfx-lib-css.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = '/home/sergei/Projects/spfx-bench';
const SP_EXTERNAL = /^@microsoft\/sp-[a-z-]+$/;
const LOC = new Set(['ControlStrings']);

// Finding F2 of the benchmark (unrelated to styles): keep sp-* / loc names external in pre-bundling.
const externalsOptimizer = {
  name: 'bench:optimizer-externals',
  resolveId(source) {
    if (SP_EXTERNAL.test(source) || LOC.has(source)) return { id: source, external: true };
    return null;
  }
};

export default defineConfig({
  root,
  cacheDir: path.join(here, '.vite-cache'),
  plugins: [
    spfxServe({ port: 4361, pageUrl: 'https://mastaq.sharepoint.com/sites/dev/SitePages/spfx-bench.aspx' }),
    ...(process.env.NO_LIBCSS ? [] : [spfxLibCss()]),
    react()
  ],
  resolve: { dedupe: ['react', 'react-dom'] },
  optimizeDeps: { rolldownOptions: { plugins: [externalsOptimizer] } }
});
