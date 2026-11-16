// Bundles each case the way Vite's dep optimizer does (Rolldown, ESM, browser), with sp-* resolved to the
// TLA facade, then runs the output in Node with a fake window.__spfxVite.require (async, 50 ms per package).
import { rolldown } from '/home/sergei/Projects/spfx-rea/node_modules/rolldown/dist/index.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const V = '\0spfx-external:';
const FAKE = {
  '@microsoft/sp-core-library': ['Version', 'Guid', 'Log'],
  '@microsoft/sp-http': ['SPHttpClient', 'HttpClient'],
  '@microsoft/sp-property-pane': ['PropertyPaneTextField']
};
const facade = (pkg) => [`const m = await window.__spfxVite.require(${JSON.stringify(pkg)});`,
  `export default (m.default !== undefined ? m.default : m);`,
  ...FAKE[pkg].map((n, i) => `const __e${i} = m[${JSON.stringify(n)}];\nexport { __e${i} as ${n} };`)].join('\n');
const S = '\0spfx-external-sync:';
// require() cannot load a module with TLA: CJS importers get a sync facade over the loaded-module registry,
// and every chunk that contains one gets `await __spfxVite.preload([...])` prepended (renderChunk).
const syncFacade = (pkg) => `module.exports = window.__spfxVite.loaded(${JSON.stringify(pkg)});`;
const plugin = {
  name: 'spfx-tla',
  resolveId: (s, importer, extra) => (FAKE[s] ? (process.env.SYNC_CJS && extra?.kind === 'require-call' ? S : V) + s : null),
  load: (id) => (id.startsWith(V) ? facade(id.slice(V.length)) : id.startsWith(S) ? syncFacade(id.slice(S.length)) : null),
  renderChunk(code, chunk) {
    const pkgs = chunk.moduleIds.filter((id) => id.startsWith(S) || (process.env.PRELOAD_ALL && id.startsWith(V)))
      .map((id) => id.slice(id.indexOf(':') + 1));
    return pkgs.length ? `await window.__spfxVite.preload(${JSON.stringify(pkgs)});\n` + code : null;
  }
};

globalThis.window = { __spfxVite: { calls: [], cache: {}, done: {},
  preload(names) { return Promise.all(names.map((n) => this.require(n))); },
  loaded(name) { if (!(name in this.done)) throw new Error(name + ' not loaded'); return this.done[name]; },
  require(name) {
  if (this.cache[name]) return this.cache[name];
  this.calls.push(name);
  const mod = Object.fromEntries(FAKE[name].map((n) => [n, { [n]: function () {} }[n]]));
  return (this.cache[name] = new Promise((r) => setTimeout(() => { this.done[name] = mod; r(mod); }, 50)));
} } };

for (const name of fs.readdirSync(path.join(here, 'cases'))) {
  const dir = path.join(here, 'cases', name);
  const outDir = path.join('/tmp/tla-rolldown-out', name);
  const report = { case: name };
  try {
    const bundle = await rolldown({ input: path.join(dir, 'index.js'), plugins: [plugin], platform: 'browser', logLevel: 'silent',
      onLog: (level, log) => { (report.logs ||= []).push(`${level}: ${log.code} ${log.message.split('\n')[0]}`); } });
    const { output } = await bundle.write({ dir: outDir, format: 'esm', sourcemap: false });
    report.chunks = output.map((c) => c.fileName);
    const code = output.map((c) => c.code || '').join('\n');
    report.tlaCount = (code.match(/await window\.__spfxVite/g) || []).length;
    report.wrapped = /__esm|__commonJS|__esmMin|init_/.test(code);
    Object.assign(window.__spfxVite, { calls: [], cache: {}, done: {} });
    const t0 = performance.now();
    const mod = await Promise.race([import(pathToFileURL(path.join(outDir, 'index.js')).href),
      new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT (deadlock?)')), 3000))]);
    report.evalMs = Math.round(performance.now() - t0);
    report.result = await (mod.result || mod.default.result)();
    report.calls = window.__spfxVite.calls.slice();
  } catch (e) {
    report.error = String(e.message || e).split('\n').slice(0, 3).join(' | ');
  }
  console.log(JSON.stringify(report));
}
