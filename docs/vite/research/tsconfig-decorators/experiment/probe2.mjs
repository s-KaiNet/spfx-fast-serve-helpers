import { transformSync, TsconfigCache } from '/home/sergei/Projects/spfx-rea/node_modules/rolldown/dist/utils-index.mjs';
import { readFileSync } from 'node:fs';
const file = process.argv[2];
for (const opts of [{}, { tsconfig: true }, { tsconfig: process.argv[3] }]) {
  for (const cache of [undefined, new TsconfigCache()]) {
    const r = transformSync(file, readFileSync(file, 'utf8'), { lang: 'ts', ...opts }, cache);
    console.log(JSON.stringify(opts), !!cache, r.tsconfigFilePaths, r.errors.map(e=>e.message), /@tagged/.test(r.code) ? 'UNTRANSFORMED' : 'transformed');
  }
}
