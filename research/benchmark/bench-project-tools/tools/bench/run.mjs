// Browser benchmark runner.
//   node tools/bench/run.mjs <suite> [runs=3] [label]
// suites: sp-baseline | heft | vite | vite-warmup | vite-loads (cold+F5 only) | heft-loads
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cdpConnect, openPage, startServer, stopServer, settle, sleep, now, median, log, treeStats, ROOT } from './lib.mjs';
import { preparePage, measureLoad, measureEdit, restore } from './browser.mjs';

const suite = process.argv[2];
const runs = Number(process.argv[3] || 3);
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench-targets.json'), 'utf8'));
const label = process.argv[4] || `${targets.modules}${targets.barrels ? '' : '-nobarrels'}`;
const expectNodes = targets.counts.tree;
const out = { suite, label, modules: targets.modules, barrels: targets.barrels, date: new Date().toISOString(), node: process.version, cpus: os.cpus()[0].model, loads: {}, edits: {}, server: {} };
const push = (group, key, value) => { ((out[group][key] ||= [])).push(value); log(group, key, JSON.stringify(value)); };
const save = () => {
  fs.mkdirSync(path.join(ROOT, 'results'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, `results/${label}-${suite}.json`), JSON.stringify(out, null, 2));
};

const cdp = await cdpConnect();

async function waitIdle(server, { idleCpu = 0.05, windowMs = 1000, maxMs = 120000 } = {}) {
  const t0 = now();
  let prev = treeStats(server.proc.pid).cpuS;
  while (now() - t0 < maxMs) {
    await sleep(windowMs);
    const cur = treeStats(server.proc.pid).cpuS;
    if (cur - prev < idleCpu) return now() - t0 - windowMs;
    prev = cur;
  }
  return null;
}

async function serverSuite(kind, { edits = true, extraLoads = true, env, warmup = false } = {}) {
  for (let i = 0; i < runs; i++) {
    const server = await startServer(kind, { env });
    if (kind === 'heft') await settle(server, 3000);
    push('server', 'start', { tListen: Math.round(server.tListen), tReady: Math.round(server.tReady), rss: server.statsAtReady.rssMB });
    if (warmup) {
      const tWarm = await waitIdle(server);
      push('server', 'warmup', { tIdleAfterReady: tWarm && Math.round(tWarm), tFromSpawn: Math.round(now() - server.t0), rss: treeStats(server.proc.pid).rssMB });
    }
    const page = await openPage(cdp);
    await preparePage(page, { debug: true, cdp, fixHeftPort: kind === 'heft' });
    push('loads', 'cold', await measureLoad(cdp, page, { debug: true, clearCache: true, server, expectNodes }));
    if (i === 0 && extraLoads) {
      for (let k = 0; k < runs; k++) push('loads', 'f5', await measureLoad(cdp, page, { debug: true, how: 'reload', server, expectNodes }));
      if (kind === 'vite') {
        for (let k = 0; k < runs; k++) push('loads', 'warmServerEmptyCache', await measureLoad(cdp, page, { debug: true, how: 'reload', clearCache: true, server, expectNodes }));
      }
    }
    if (i === runs - 1 && edits) {
      // make sure the page is in a steady state
      await measureLoad(cdp, page, { debug: true, how: 'reload', server, expectNodes });
      for (const kindOfEdit of ['leaf', 'mid', 'scss']) {
        const target = targets[kindOfEdit];
        let original = null, file = null;
        for (let k = 0; k < runs; k++) {
          const cpu0 = treeStats(server.proc.pid).cpuS;
          const e = await measureEdit(page, target, kindOfEdit, k, { reloadExpected: kind === 'heft', server });
          if (original === null) { original = e.original; file = e.file; }
          if (kind === 'heft') { await settle(server, 2500); }
          await sleep(kind === 'heft' ? 3000 : 1000);
          push('edits', kindOfEdit, { latency: e.latency, rebuild: e.rebuild, manualReload: e.manualReload, serverCpuS: Math.round((treeStats(server.proc.pid).cpuS - cpu0) * 100) / 100 });
        }
        restore({ original, file });
        if (kind === 'heft') await settle(server, 2500); else await sleep(1500);
        await measureLoad(cdp, page, { debug: true, how: 'reload', server, expectNodes });
      }
    }
    push('server', 'end', { rss: treeStats(server.proc.pid).rssMB, peakRss: server.peakRss, cpuS: treeStats(server.proc.pid).cpuS });
    await page.close();
    await stopServer(server);
    save();
  }
}

try {
  if (suite === 'sp-baseline') {
    for (let i = 0; i < runs; i++) {
      const page = await openPage(cdp);
      await preparePage(page, { debug: false });
      push('loads', 'cold', await measureLoad(cdp, page, { debug: false, clearCache: true }));
      push('loads', 'f5', await measureLoad(cdp, page, { debug: false, how: 'reload' }));
      await page.close();
    }
  } else if (suite === 'heft') await serverSuite('heft');
  else if (suite === 'vite') await serverSuite('vite');
  else if (suite === 'heft-loads') await serverSuite('heft', { edits: false });
  else if (suite === 'vite-loads') await serverSuite('vite', { edits: false });
  else if (suite === 'vite-nohold') await serverSuite('vite', { edits: false, env: { BENCH_NOHOLD: '1' } });
  else if (suite === 'heft-leaf') await serverSuite('heft', { extraLoads: true });
  else if (suite === 'vite-warmup') await serverSuite('vite', { edits: false, extraLoads: false, env: { BENCH_WARMUP: '1' }, warmup: true });
  else throw new Error('unknown suite ' + suite);
} finally {
  save();
  cdp.close();
}

// summary
const sum = {};
for (const [k, rs] of Object.entries(out.loads)) sum['load.' + k] = { tRendered: median(rs.map((r) => r.tRendered ?? r.wpZone)), manifestsStart: median(rs.map((r) => r.manifestsStart)), lastLocalEnd: median(rs.map((r) => r.lastLocalEnd)), local: median(rs.map((r) => r.local)), localKB: Math.round(median(rs.map((r) => r.localBytes)) / 1024), n: rs.length, ok: rs.filter((r) => r.ok).length };
for (const [k, rs] of Object.entries(out.edits)) sum['edit.' + k] = { latency: median(rs.map((r) => r.latency)), n: rs.length };
console.table(sum);
