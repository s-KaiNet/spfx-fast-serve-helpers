import { transformWithOxc } from '/home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/index.js';
import { readFileSync } from 'node:fs';
const file = process.argv[2];
const extra = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const r = await transformWithOxc(readFileSync(file, 'utf8'), file, extra);
console.log('tsconfigs:', r.tsconfigFilePaths, 'warnings:', r.warnings.map((w) => w.message));
console.log(r.code);
