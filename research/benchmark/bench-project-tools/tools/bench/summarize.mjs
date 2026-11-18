// Prints medians from results/*.json (pooled per label/suite).
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, median } from './lib.mjs';
const dir = path.join(ROOT, 'results');
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('start-') && !f.includes('crawl'));
const m = (rs, k) => median(rs.filter((r) => r.ok !== false).map((r) => r[k]));
for (const f of files.sort()) {
  const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  console.log(`\n## ${f}`);
  for (const [k, rs] of Object.entries(d.loads || {})) {
    const ok = rs.filter((r) => r.ok);
    console.log(`load.${k}: n=${rs.length} ok=${ok.length} rendered=${m(rs, 'tRendered') ?? m(rs, 'wpZone')} tree=${m(rs, 'tTree')} pnp=${m(rs, 'tPnp')} canvas=${m(rs, 'wpZone')} manifests=${m(rs, 'manifestsStart')} lastLocal=${m(rs, 'lastLocalEnd')} local=${m(rs, 'local')} localKB=${Math.round((m(rs, 'localBytes') || 0) / 1024)} total=${m(rs, 'total')} totalKB=${Math.round(m(rs, 'totalBytes') / 1024)} srvCpu=${m(rs, 'serverCpuS')} rss=${m(rs, 'serverRssMB')} all=${JSON.stringify(rs.map((r) => r.tRendered ?? r.wpZone))}`);
  }
  for (const [k, rs] of Object.entries(d.edits || {})) console.log(`edit.${k}: latency=${median(rs.map((r) => r.latency))} rebuild=${median(rs.map((r) => r.rebuild))} all=${JSON.stringify(rs.map((r) => r.latency))} srvCpu=${median(rs.map((r) => r.serverCpuS))}`);
  for (const [k, rs] of Object.entries(d.server || {})) console.log(`server.${k}: ${JSON.stringify(rs)}`);
}
