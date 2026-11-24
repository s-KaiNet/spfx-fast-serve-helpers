// Dev server only (`npm run serve`). Builds/packaging stay on Heft.
// The spfx-serve plugin is imported unmodified from the spfx-rea repo.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import spfxServe from '../spfx-rea/tools/vite-plugin-spfx-serve/index.mjs';
import benchWorkarounds from './tools/vite-bench-workarounds.mjs';

// Benchmark switches (env): BENCH_WARMUP=1 -> server.warmup for src.
const warmup = process.env.BENCH_WARMUP === '1';
// BENCH_NOHOLD=1 -> optimizeDeps.holdUntilCrawlEnd: false (don't hold optimized-dep responses until the static-import crawl ends).
const noHold = process.env.BENCH_NOHOLD === '1';

export default defineConfig({
  plugins: [
    spfxServe({
      pageUrl: process.env.SPFX_SERVE_PAGE || 'https://contoso.sharepoint.com/sites/dev/SitePages/spfx-bench.aspx'
    }),
    benchWorkarounds({ localizedResources: ['ControlStrings'] }),
    react()
  ],
  server: {
    ...(warmup ? { warmup: { clientFiles: ['./src/**/*.ts', './src/**/*.tsx'] } } : {})
  },
  optimizeDeps: noHold ? { holdUntilCrawlEnd: false } : {}
});
