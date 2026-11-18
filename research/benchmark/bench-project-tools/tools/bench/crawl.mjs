// Browser-free crawl of the Vite module graph over HTTP/2, like the browser's import waterfall
// (every newly discovered import is requested at once). Measures server-side transform cost and graph shape.
//   node tools/bench/crawl.mjs [runs=3] [label]
import http2 from 'node:http2';
import fs from 'node:fs';
import path from 'node:path';
import { init, parse } from 'es-module-lexer';
import { startServer, stopServer, ORIGIN, ROOT, median, log, treeStats, sleep } from './lib.mjs';

await init;
const runs = Number(process.argv[2] || 3);
const targets = JSON.parse(fs.readFileSync(path.join(ROOT, 'bench-targets.json'), 'utf8'));
const label = process.argv[3] || `${targets.modules}${targets.barrels ? '' : '-nobarrels'}`;
const ids = ['src/webparts/benchTree/BenchTreeWebPart.manifest.json', 'src/webparts/benchPnp/BenchPnpWebPart.manifest.json']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8').match(/"id":\s*"([^"]+)"/)[1]);

function crawl() {
  const client = http2.connect(ORIGIN, { rejectUnauthorized: false });
  const seen = new Map();
  let inflight = 0, maxDepth = 0, bytes = 0, srcCount = 0, depCount = 0;
  const t0 = performance.now();
  return new Promise((resolve, reject) => {
    const fetchUrl = (url, depth) => {
      if (seen.has(url)) return;
      seen.set(url, depth);
      maxDepth = Math.max(maxDepth, depth);
      inflight++;
      const req = client.request({ ':path': url });
      let body = '';
      req.setEncoding('utf8');
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        bytes += Buffer.byteLength(body);
        if (url.startsWith('/node_modules/.vite/deps/')) depCount++; else if (url.startsWith('/src/')) srcCount++;
        try {
          const [imports] = parse(body);
          for (const imp of imports) {
            const spec = imp.n;
            if (!spec || imp.d === -2) continue; // import.meta
            if (spec.startsWith('/')) fetchUrl(spec, depth + 1);
            else if (spec.startsWith('.')) fetchUrl(new URL(spec, ORIGIN + url).pathname + new URL(spec, ORIGIN + url).search, depth + 1);
          }
        } catch { /* css etc. */ }
        if (--inflight === 0) { client.close(); resolve({ ms: Math.round(performance.now() - t0), requests: seen.size, src: srcCount, deps: depCount, depth: maxDepth, kb: Math.round(bytes / 1024) }); }
      });
      req.on('error', reject);
    };
    for (const id of ids) fetchUrl('/@spfx-entry/' + id, 0);
  });
}

const rows = [];
for (let i = 0; i < runs; i++) {
  const s = await startServer('vite', {});
  const cpu0 = treeStats(s.proc.pid).cpuS;
  const cold = await crawl();
  const cpu1 = treeStats(s.proc.pid).cpuS;
  const warm = await crawl();
  const r = { cold, warm, coldServerCpuS: Math.round((cpu1 - cpu0) * 100) / 100, rssAfter: treeStats(s.proc.pid).rssMB, newDeps: /new dependencies|optimized dependencies changed|reloading/i.test(s.out) };
  log(JSON.stringify(r));
  rows.push(r);
  await stopServer(s);
  await sleep(500);
}
const table = { coldMs: median(rows.map((r) => r.cold.ms)), warmMs: median(rows.map((r) => r.warm.ms)), requests: rows[0].cold.requests, src: rows[0].cold.src, deps: rows[0].cold.deps, depth: rows[0].cold.depth, kb: rows[0].cold.kb, coldServerCpuS: median(rows.map((r) => r.coldServerCpuS)), rssAfter: median(rows.map((r) => r.rssAfter)) };
console.table(table);
fs.writeFileSync(path.join(ROOT, `results/${label}-crawl.json`), JSON.stringify({ label, rows, table }, null, 2));
