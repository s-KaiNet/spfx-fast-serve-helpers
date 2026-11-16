// Throwaway prototype: TLA facades for SPFx externals. Run from the repo root:
//   npx vite --config research/tla-externals/proto/vite.config.mjs
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import spfxServe from './plugin.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export default defineConfig({
  root: path.resolve(here, '../../..'),
  cacheDir: '/tmp/tla-externals-vite',
  plugins: [spfxServe({ port: 4331, pageUrl: 'https://mastaq.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx' }), react()],
  resolve: { alias: { 'fake-spfx-dep': path.join(here, 'fake-spfx-dep/index.js') } },
  optimizeDeps: { include: ['fake-spfx-dep'] }
});
