// Server start benchmark (no browser).  node tools/bench/start.mjs [runs=3] [kinds=heft,vite] [tag]
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { startServer, stopServer, settle, median, log, ROOT, sleep } from './lib.mjs';

const runs = Number(process.argv[2] || 3);
const kinds = (process.argv[3] || 'heft,vite').split(',');
const tag = process.argv[4] || JSON.parse(fs.readFileSync(path.join(ROOT, 'bench-targets.json'), 'utf8')).modules;
const results = [];
for (const kind of kinds) {
  for (const clean of [true, false]) {
    for (let i = 0; i < runs; i++) {
      const load = os.loadavg()[0];
      const s = await startServer(kind, { clean });
      if (kind === 'heft') await settle(s, 3000); else await sleep(1500);
      const r = { kind, clean, run: i, tListen: Math.round(s.tListen), tReady: Math.round(s.tReady), rssAtReady: s.statsAtReady.rssMB, cpuAtReady: s.statsAtReady.cpuS, peakRss: s.peakRss, load1: load };
      await stopServer(s);
      log(JSON.stringify(r));
      results.push(r);
      await sleep(1000);
    }
  }
}
const summary = {};
for (const r of results) {
  const k = `${r.kind}-${r.clean ? 'cold' : 'warm'}`;
  (summary[k] ||= []).push(r);
}
const table = Object.fromEntries(Object.entries(summary).map(([k, rs]) => [k, {
  tListen: median(rs.map((r) => r.tListen)), tReady: median(rs.map((r) => r.tReady)),
  rssAtReady: median(rs.map((r) => r.rssAtReady)), cpuAtReady: median(rs.map((r) => r.cpuAtReady)), peakRss: median(rs.map((r) => r.peakRss)), n: rs.length
}]));
console.table(table);
fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
fs.writeFileSync(path.join(ROOT, `results/start-${tag}.json`), JSON.stringify({ tag, node: process.version, results, table }, null, 2));
