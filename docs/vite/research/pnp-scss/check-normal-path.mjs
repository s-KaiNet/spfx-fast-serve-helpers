// Normal (non-pre-bundled) path: transform a pnp module through the Vite pipeline and follow its style import.
import { createServer } from 'vite';
const server = await createServer({
  configFile: new URL('./vite.config.mjs', import.meta.url).pathname,
  server: { port: 4362, hmr: false, ws: false },
  optimizeDeps: { noDiscovery: true, include: [] },
  logLevel: 'warn'
});
const url = '/node_modules/@pnp/spfx-controls-react/lib/controls/peoplepicker/PeoplePickerComponent.js';
const js = await server.transformRequest(url);
const imp = js.code.match(/import styles from "([^"]+)"/)[1];
console.log('rewritten import:', imp);
// the /@id/ middleware unwraps the URL before transformRequest
const css = await server.transformRequest(imp.replace(/^\/@id\//, '').replace('__x00__', '\0'));
console.log(css.code.slice(0, 600));
await server.close();
