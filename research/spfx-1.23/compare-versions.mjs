import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const pkgs = process.argv.slice(2);
const roots = ['/tmp/spfx123/hello123', '/tmp/spfx124ref/hello124'];
const files = Object.fromEntries(roots.map(r => [r, execSync(`find ${r}/node_modules -name package.json -path '*/node_modules/*/package.json' -not -path '*/test*'`, { maxBuffer: 1e9 }).toString().split('\n')]));
for (const p of pkgs) {
  const row = roots.map(r => [...new Set(files[r].filter(f => f.endsWith(`/node_modules/${p}/package.json`)).map(f => { try { return JSON.parse(readFileSync(f)).version } catch { return '?' } }))].sort().join(','));
  console.log(`| \`${p}\` | ${row[0] || '-'} | ${row[1] || '-'} |`);
}
