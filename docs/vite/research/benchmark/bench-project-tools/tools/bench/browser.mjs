// Page-level measurements over CDP.
import fs from 'node:fs';
import path from 'node:path';
import { PAGE, DEBUG_QUERY, DEBUG_SESSION_SCRIPT, ROOT, netRecorder, sleep, now, treeStats, log } from './lib.mjs';

export const DEBUG_URL = `${PAGE}?${DEBUG_QUERY}`;

// Installed into every document: timestamps for the SharePoint canvas and for edit detection.
const OBSERVER_SCRIPT = `(() => {
  if (window.top !== window) return;
  const marks = window.__benchMarks = {};
  const check = () => {
    if (!marks.canvas && document.querySelector('.CanvasZone, [data-automation-id="CanvasZone"]')) marks.canvas = performance.now();
    if (!marks.wpZone && document.querySelectorAll('.ControlZone').length >= 2) marks.wpZone = performance.now();
    const e = window.__benchEditCond;
    if (e && !window.__benchEditDone) {
      try { if (e()) window.__benchEditDone = Date.now(); } catch (err) {}
    }
  };
  const start = () => {
    new MutationObserver(check).observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
    check();
  };
  if (document.documentElement) start(); else document.addEventListener('readystatechange', start, { once: true });
  try {
    const raw = sessionStorage.getItem('__benchEditCond');
    if (raw) window.__benchEditCond = new Function('return (' + raw + ')')();
  } catch (err) {}
})();`;

export async function preparePage(page, { debug, cdp, fixHeftPort = false }) {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: OBSERVER_SCRIPT });
  if (fixHeftPort) {
    // SPFx 1.24.1: heft's temp/build/manifests.js hard-codes https://localhost:4321/dist/ even when serve.json sets
    // another port. Rewrite just that one response (no other request is intercepted).
    await page.send('Fetch.enable', { patterns: [{ urlPattern: '*localhost:4341/temp/build/manifests.js*', requestStage: 'Response' }] });
    cdp.on(async (m) => {
      if (m.sessionId !== page.sessionId || m.method !== 'Fetch.requestPaused') return;
      const { requestId, responseStatusCode, responseHeaders } = m.params;
      try {
        const b = await page.send('Fetch.getResponseBody', { requestId });
        const body = (b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body).split('localhost:4321').join('localhost:4341');
        await page.send('Fetch.fulfillRequest', { requestId, responseCode: responseStatusCode || 200, responseHeaders, body: Buffer.from(body).toString('base64') });
      } catch (e) { try { await page.send('Fetch.continueRequest', { requestId }); } catch {} }
    });
  }
  if (debug) await page.send('Page.addScriptToEvaluateOnNewDocument', { source: DEBUG_SESSION_SCRIPT });
}

const STATE_EXPR = `(() => {
  const m = window.__benchMarks || {};
  const nav = performance.getEntriesByType('navigation')[0] || {};
  return { tree: window.__benchTreeReady || null, pnp: window.__benchPnpReady || null,
    nodes: document.querySelectorAll('[data-node]').length, canvas: m.canvas || null, wpZone: m.wpZone || null,
    dcl: nav.domContentLoadedEventEnd || null, load: nav.loadEventEnd || null, href: location.href,
    errorText: (document.querySelector('[data-automation-id="error-message"], .ms-MessageBar--error') || {}).textContent || null };
})()`;

/**
 * Navigate/reload and wait until the web parts rendered (debug) or the canvas is ready (no debug).
 * @param {'navigate'|'reload'} how
 */
export async function measureLoad(cdp, page, { debug, how = 'navigate', clearCache = false, server, expectNodes, timeoutMs = 180000 }) {
  if (clearCache) await page.send('Network.clearBrowserCache');
  const net = netRecorder(cdp, page);
  const cpu0 = server ? treeStats(server.proc.pid).cpuS : 0;
  net.start();
  const t0 = now();
  if (how === 'reload') await page.send('Page.reload', { ignoreCache: false });
  else await page.send('Page.navigate', { url: debug ? DEBUG_URL : PAGE });
  let state;
  const deadline = t0 + timeoutMs;
  await sleep(300);
  while (now() < deadline) {
    try { state = await page.eval(STATE_EXPR); } catch { state = null; }
    if (state && debug && state.tree && state.pnp && (!expectNodes || state.nodes >= expectNodes)) break;
    if (state && !debug && state.wpZone && state.load) break;
    await sleep(100);
  }
  const wall = now() - t0;
  await sleep(debug ? 500 : 1500); // let trailing requests finish
  const list = net.stop();
  const summary = net.summary(list);
  const cpu1 = server ? treeStats(server.proc.pid) : null;
  const ok = debug ? !!(state && state.tree && state.pnp) : !!(state && state.wpZone);
  const r = {
    ok, how, clearCache, wall: Math.round(wall),
    tTree: state?.tree && Math.round(state.tree), tPnp: state?.pnp && Math.round(state.pnp),
    tRendered: state?.tree && state?.pnp ? Math.round(Math.max(state.tree, state.pnp)) : null,
    canvas: state?.canvas && Math.round(state.canvas), wpZone: state?.wpZone && Math.round(state.wpZone),
    dcl: state?.dcl && Math.round(state.dcl), load: state?.load && Math.round(state.load),
    nodes: state?.nodes, ...summary,
    serverCpuS: server ? Math.round((cpu1.cpuS - cpu0) * 100) / 100 : null, serverRssMB: cpu1?.rssMB ?? null,
    errors: page.consoleErrors.splice(0).filter((e) => !/ResizeObserver|Failed to load resource: the server responded with a status of 40[134]/.test(e)).slice(0, 5)
  };
  if (!ok) { r.state = state; r.hrefNow = state?.href; }
  return r;
}

/**
 * Edit a file and measure until the DOM reflects the change.
 * kind: 'leaf'|'mid' (text 'vN' in the node label) or 'scss' (marker outline colour).
 */
export async function measureEdit(page, target, kind, iteration, { reloadExpected, server, timeoutMs = 120000 }) {
  const file = path.join(ROOT, target.file);
  const original = fs.readFileSync(file, 'utf8');
  let next, cond;
  if (kind === 'scss') {
    const m = original.match(/rgb\(0, 0, (\d+)\)/);
    const value = (Number(m[1]) + iteration + 1) % 255;
    next = original.replace(m[0], `rgb(0, 0, ${value})`);
    cond = `() => { const el = document.querySelector('[data-marker="${target.node}"]'); return !!el && getComputedStyle(el).outlineColor === 'rgb(0, 0, ${value})'; }`;
  } else {
    const tag = `e${Date.now() % 100000}`;
    next = original.replace(/\{\/\*EDIT\*\/'[^']*'\}/, `{/*EDIT*/'${tag}'}`);
    cond = `() => { const el = document.querySelector('[data-node="${target.node}"] .node-label'); return !!el && el.textContent.indexOf('${tag}') === 0; }`;
  }
  // Store the condition in sessionStorage too, so it survives a full page reload (heft).
  await page.eval(`(() => { window.__benchEditDone = null; sessionStorage.setItem('__benchEditCond', ${JSON.stringify(cond)}); window.__benchEditCond = ${cond}; return true; })()`);
  const navs = [];
  const tEdit = Date.now();
  fs.writeFileSync(file, next);
  let done = null, tBuilt = null, manualReload = false;
  const deadline = Date.now() + timeoutMs;
  const ev0 = server ? server.events.length : 0;
  while (Date.now() < deadline) {
    await sleep(50);
    if (server && reloadExpected && !tBuilt && server.events.slice(ev0).some((e) => /build finished/.test(e.line))) tBuilt = Date.now();
    // heft: webpack HMR/live reload doesn't always reload the page (two bundles); act like the developer pressing F5.
    if (tBuilt && !manualReload && Date.now() - tBuilt > 1500) { manualReload = true; page.send('Page.reload', { ignoreCache: false }).catch(() => {}); }
    try {
      // After a full reload (heft) the in-page observer may be gone (CSP can block new Function), so also check directly.
      done = await page.eval(`window.__benchEditDone || ((${cond})() ? (window.__benchEditDone = Date.now()) : null)`);
    } catch { done = null; }
    if (done) break;
  }
  await page.eval(`sessionStorage.removeItem('__benchEditCond'), true`).catch(() => {});
  return { kind, latency: done ? done - tEdit : null, rebuild: tBuilt && tBuilt - tEdit, manualReload, original, file };
}

export function restore(edit) { fs.writeFileSync(edit.file, edit.original); }
