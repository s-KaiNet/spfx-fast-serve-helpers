import { transformWithOxc } from '/home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/index.js';
import { readFileSync } from 'node:fs';
const [file, mode] = process.argv.slice(2);
const config = mode === 'viteTsconfig' ? { tsconfig: '/home/sergei/Projects/spfx-rea/tsconfig.json' } : undefined;
const options = mode === 'oxcDecorator' ? { decorator: { legacy: true } } : {};
const r = await transformWithOxc(readFileSync(file, 'utf8'), file, options, undefined, config);
console.log('// tsconfigs:', r.tsconfigFilePaths.join(','), 'warnings:', r.warnings.map((w) => w.message).join(' | '));
console.log(r.code);
