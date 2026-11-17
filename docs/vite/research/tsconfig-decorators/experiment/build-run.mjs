import { transformWithOxc } from '/home/sergei/Projects/spfx-rea/node_modules/vite/dist/node/index.js';
import { readFileSync, writeFileSync, mkdirSync, cpSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
const src = '/home/sergei/Projects/spfx-rea/src/decoexp';
const out = '/tmp/deco-exp/run';
const rewrite = (code) =>
  code
    .replace(/from "(\.\.?\/[^"]+)"/g, (m, p) => `from "${p}.mjs"`)
    .replace(/import "(\.\.?\/[^"]+)"/g, (m, p) => `import "${p}.mjs"`);
const files = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') && !p.endsWith('.d.ts') ? [p] : []; });
const base = { experimentalDecorators: true, strict: true, target: 'es5' };
const variants = {
  oxcToday: () => ({}),
  oxcFixed: (file) => ({ tsconfig: { compilerOptions: { ...base, emitDecoratorMetadata: file.includes('/meta/') } } }),
};
for (const [name, opts] of Object.entries(variants)) {
  for (const file of files(src)) {
    const r = await transformWithOxc(readFileSync(file, 'utf8'), file, opts(file));
    const target = path.join(out, name, path.relative(src, file)).replace(/\.ts$/, '.mjs');
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, rewrite(r.code));
  }
}
for (const file of files('/tmp/deco-exp/tsc-out').length ? [] : []) {}
const tscFiles = (dir) => readdirSync(dir).flatMap((f) => { const p = path.join(dir, f); return statSync(p).isDirectory() ? tscFiles(p) : [p]; });
for (const file of tscFiles('/tmp/deco-exp/tsc-out')) {
  const target = path.join(out, 'tsc', path.relative('/tmp/deco-exp/tsc-out', file)).replace(/\.js$/, '.mjs');
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, readFileSync(file, 'utf8').replace(/from '(\.\.?\/[^']+)'/g, (m, p) => `from '${p}.mjs'`).replace(/export \* from '(\.\.?\/[^']+)'/g, (m, p) => `export * from '${p}.mjs'`));
}
