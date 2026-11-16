// Compile every pnp *.module.scss.css with the prototype and compare its CSS text + class map with the heft dist bundle.
import fs from 'node:fs';
import path from 'node:path';
import { spfxLibCssRolldown } from './spfx-lib-css.mjs';
const root = '/home/sergei/Projects/spfx-bench';
const dist = fs.readFileSync(path.join(root, 'dist/bench-pnp-web-part.js'), 'utf8');
const lib = path.join(root, 'node_modules/@pnp/spfx-controls-react/lib');
const files = fs.globSync('**/*.module.scss.css', { cwd: lib });
const p = spfxLibCssRolldown(root);
let inDist = 0, cssMatch = 0, mapMatch = 0;
for (const f of files) {
  const abs = path.join(lib, f);
  const id = p.resolveId('./' + path.basename(abs, '.css'), abs.replace(/\.module\.scss\.css$/, '.js'));
  const { code } = await p.load(id);
  const css = JSON.parse(code.match(/loadStyles\(("(?:[^"\\]|\\.)*")/)[1]);
  const hash = (code.match(/_([0-9a-f]{8})"/) || [])[1];
  if (!hash || !dist.includes('_' + hash)) continue;
  inDist++;
  // webpack's dev bundle embeds the loader output as a string inside eval/plain code; compare the whole CSS (dist adds an inline source map after it)
  if (dist.includes(JSON.stringify(css).slice(1, -1))) cssMatch++; else console.log('css differs:', f);
  const map = code.slice(code.indexOf('export default {'));
  const entries = [...map.matchAll(/^\s+("?[\w-]+"?): (".*")/gm)].map((m) => `${m[1]}: ${m[2]}`);
  if (entries.every((e) => dist.includes(e))) mapMatch++; else console.log('map differs:', f, entries.filter((e) => !dist.includes(e)).slice(0, 3));
}
console.log({ files: files.length, inDist, cssMatch, mapMatch });
