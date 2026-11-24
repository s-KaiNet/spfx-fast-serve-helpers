// Benchmark helpers: dev-server control, process-tree stats, a tiny raw CDP client.
import { spawn, execSync } from 'node:child_process';
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PORT = 4341;
export const ORIGIN = `https://localhost:${PORT}`;
export const CDP_PORT = 9351;
export const PAGE = 'https://contoso.sharepoint.com/sites/dev/SitePages/spfx-bench.aspx';
export const MANIFESTS = `${ORIGIN}/temp/build/manifests.js`;
export const DEBUG_QUERY = `debugManifestsFile=${encodeURIComponent(MANIFESTS)}&debug=true&noredir=true`;
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const now = () => performance.now();
export const median = (a) => { const s = a.filter((x) => typeof x === 'number' && !Number.isNaN(x)).sort((x, y) => x - y); if (!s.length) return null; const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
export const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

/** GET with the self-signed dev cert accepted. Resolves { status, bytes } or rejects on connection error. */
export function get(url, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false, timeout: timeoutMs }, (res) => {
      let bytes = 0;
      res.on('data', (c) => { bytes += c.length; });
      res.on('end', () => resolve({ status: res.statusCode, bytes }));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
  });
}

// ---------------------------------------------------------------------------------------------
// Process tree stats (Linux /proc)
// ---------------------------------------------------------------------------------------------
const TICK = 100; // CLK_TCK
function procList() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    try {
      const stat = fs.readFileSync(`/proc/${d}/stat`, 'utf8');
      const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
      const status = fs.readFileSync(`/proc/${d}/status`, 'utf8');
      const rss = Number((status.match(/VmRSS:\s+(\d+)/) || [0, 0])[1]);
      out.push({ pid: Number(d), ppid: Number(rest[1]), cpu: (Number(rest[11]) + Number(rest[12])) / TICK, rss });
    } catch { /* gone */ }
  }
  return out;
}
/** Sum of RSS (MB) and CPU seconds (user+sys) for pid and all descendants. */
export function treeStats(pid) {
  const all = procList();
  const ids = new Set([pid]);
  let grew = true;
  while (grew) { grew = false; for (const p of all) if (!ids.has(p.pid) && ids.has(p.ppid)) { ids.add(p.pid); grew = true; } }
  let rss = 0, cpu = 0, n = 0;
  for (const p of all) if (ids.has(p.pid)) { rss += p.rss; cpu += p.cpu; n++; }
  return { rssMB: Math.round(rss / 1024), cpuS: Math.round(cpu * 100) / 100, procs: n };
}

// ---------------------------------------------------------------------------------------------
// Dev servers
// ---------------------------------------------------------------------------------------------
export function portBusy() {
  try { execSync(`ss -ltn 'sport = :${PORT}' | grep -q LISTEN`); return true; } catch { return false; }
}

/**
 * @param {'heft'|'vite'} kind
 * @param {{ clean?: boolean, env?: object, extraArgs?: string[] }} opts  clean = heft --clean / vite --force
 */
export async function startServer(kind, opts = {}) {
  if (portBusy()) throw new Error(`port ${PORT} busy`);
  const args = kind === 'heft'
    ? ['node_modules/.bin/heft', 'start', '--nobrowser', ...(opts.clean ? ['--clean'] : [])]
    : ['node_modules/.bin/vite', ...(opts.clean ? ['--force'] : []), ...(opts.extraArgs || [])];
  const t0 = now();
  const proc = spawn(process.execPath, args, { cwd: ROOT, detached: true, env: { ...process.env, FORCE_COLOR: '0', ...(opts.env || {}) }, stdio: ['ignore', 'pipe', 'pipe'] });
  const server = { kind, proc, t0, out: '', events: [], peakRss: 0 };
  const onData = (d) => {
    const text = d.toString();
    server.out += text;
    for (const line of text.split('\n')) if (line.trim()) server.events.push({ t: now() - t0, line });
  };
  proc.stdout.on('data', onData);
  proc.stderr.on('data', onData);
  server.sampler = setInterval(() => { const s = treeStats(proc.pid); if (s.rssMB > server.peakRss) server.peakRss = s.rssMB; }, 250);
  // listening
  while (!portBusy()) { if (proc.exitCode !== null) throw new Error(`${kind} exited:\n${server.out.slice(-2000)}`); await sleep(25); }
  server.tListen = now() - t0;
  if (kind === 'heft') {
    // webpack-dev-middleware holds requests until the first compilation has finished.
    const r = await get(MANIFESTS, 300000);
    if (r.status !== 200) throw new Error('manifests ' + r.status);
    server.tReady = now() - t0;
  } else {
    // Vite answers immediately; with --force (or a changed lockfile) deps are optimized in the background.
    const meta = path.join(ROOT, 'node_modules/.vite/deps/_metadata.json');
    if (opts.clean) { while (!fs.existsSync(meta)) await sleep(20); }
    server.tReady = now() - t0;
  }
  server.statsAtReady = treeStats(proc.pid);
  return server;
}

/** Wait until heft's watch output is quiet (no new lines for quietMs) and the last run finished. */
export async function settle(server, quietMs = 2500, maxMs = 120000) {
  const start = now();
  let last = server.events.length, lastChange = now();
  while (now() - start < maxMs) {
    await sleep(100);
    if (server.events.length !== last) { last = server.events.length; lastChange = now(); }
    if (now() - lastChange > quietMs) return;
  }
}

export async function stopServer(server) {
  if (!server) return;
  clearInterval(server.sampler);
  try { process.kill(-server.proc.pid, 'SIGTERM'); } catch { /* gone */ }
  for (let i = 0; i < 100 && portBusy(); i++) await sleep(100);
  if (portBusy()) { try { process.kill(-server.proc.pid, 'SIGKILL'); } catch { /* */ } await sleep(500); }
}

// ---------------------------------------------------------------------------------------------
// CDP
// ---------------------------------------------------------------------------------------------
export async function cdpConnect(port = CDP_PORT) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Set();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(msg.error.message + ' ' + (msg.error.data || ''))) : resolve(msg.result);
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  };
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  return { ws, send, on: (fn) => { listeners.add(fn); return () => listeners.delete(fn); }, close: () => ws.close() };
}

/** Opens a new tab and returns a page helper bound to its session. */
export async function openPage(cdp) {
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  const s = (m, p) => cdp.send(m, p, sessionId);
  await s('Page.enable');
  await s('Network.enable', { maxTotalBufferSize: 0, maxResourceBufferSize: 0 });
  await s('Runtime.enable');
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Page.bringToFront');
  const page = {
    targetId, sessionId, send: s,
    async eval(expr) {
      const r = await s('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
      if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
      return r.result.value;
    },
    async close() { await cdp.send('Target.closeTarget', { targetId }); }
  };
  // console errors
  page.consoleErrors = [];
  cdp.on((m) => {
    if (m.sessionId !== sessionId) return;
    if (m.method === 'Runtime.exceptionThrown') page.consoleErrors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') page.consoleErrors.push(m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300));
  });
  return page;
}

/** Records network activity of a page between start() and stop(). */
export function netRecorder(cdp, page) {
  const reqs = new Map();
  let off = null;
  return {
    start() {
      reqs.clear();
      off = cdp.on((m) => {
        if (m.sessionId !== page.sessionId) return;
        const p = m.params;
        if (m.method === 'Network.requestWillBeSent') {
          const r = reqs.get(p.requestId) || {};
          reqs.set(p.requestId, { ...r, url: p.request.url, start: p.timestamp, type: p.type, doc: p.type === 'Document' });
        } else if (m.method === 'Network.responseReceived') {
          const r = reqs.get(p.requestId); if (r) { r.status = p.response.status; r.fromCache = p.response.fromDiskCache || p.response.fromMemoryCache; }
        } else if (m.method === 'Network.requestServedFromCache') {
          const r = reqs.get(p.requestId); if (r) r.fromCache = true;
        } else if (m.method === 'Network.loadingFinished') {
          const r = reqs.get(p.requestId); if (r) { r.end = p.timestamp; r.bytes = p.encodedDataLength; }
        } else if (m.method === 'Network.loadingFailed') {
          const r = reqs.get(p.requestId); if (r) { r.end = p.timestamp; r.failed = p.errorText; }
        }
      });
    },
    stop() { off && off(); off = null; return [...reqs.values()]; },
    summary(list) {
      const docs = list.filter((r) => r.doc && r.url.startsWith('https://contoso'));
      const t0 = docs.length ? docs[0].start : Math.min(...list.map((r) => r.start));
      const local = list.filter((r) => r.url.startsWith(ORIGIN));
      const rel = (t) => (t === undefined ? null : Math.round((t - t0) * 1000));
      const by = (pred) => local.filter(pred);
      return {
        total: list.length,
        totalBytes: list.reduce((a, r) => a + (r.bytes || 0), 0),
        local: local.length,
        localBytes: local.reduce((a, r) => a + (r.bytes || 0), 0),
        local304: by((r) => r.status === 304).length,
        localFromCache: by((r) => r.fromCache).length,
        localFailed: by((r) => r.failed).map((r) => r.url + ' ' + r.failed),
        firstLocalStart: local.length ? rel(Math.min(...local.map((r) => r.start))) : null,
        manifestsStart: rel(local.find((r) => r.url.includes('/temp/build/manifests.js'))?.start),
        lastLocalEnd: local.length ? rel(Math.max(...local.map((r) => r.end || r.start))) : null,
        slowestLocal: local.map((r) => ({ url: r.url.replace(ORIGIN, '').slice(0, 120), start: rel(r.start), ms: r.end ? Math.round((r.end - r.start) * 1000) : 'pending', status: r.status }))
          .sort((a, b) => (b.ms === 'pending' ? 1e9 : b.ms) - (a.ms === 'pending' ? 1e9 : a.ms)).slice(0, 4)
      };
    }
  };
}

/** Script that sets the SPFx debug decision for this tab (skips the "Allow debug scripts?" prompt). */
export const DEBUG_SESSION_SCRIPT = `try { if (location.hostname === 'contoso.sharepoint.com' && location.search.indexOf('debugManifestsFile') >= 0) sessionStorage.setItem('spfx-debug', JSON.stringify({ liveReload: false, manifestsFileUrl: ${JSON.stringify(MANIFESTS)}, hasLogged3pDebug: false })); } catch (e) {}`;
