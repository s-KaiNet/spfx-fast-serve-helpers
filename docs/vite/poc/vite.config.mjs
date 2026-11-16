// Dev server only (`npm run serve`). Production builds and packaging still use Heft (`npm run build`).
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import spfxServe from './tools/vite-plugin-spfx-serve/index.mjs';

export default defineConfig({
  plugins: [
    spfxServe({
      pageUrl: process.env.SPFX_SERVE_PAGE || 'https://mastaq.sharepoint.com/sites/dev/SitePages/spfx-rea.aspx'
    }),
    react()
  ]
});
