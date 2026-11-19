import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const [heftDist, ourDist, reportFile] = process.argv.slice(2);
if (!heftDist || !ourDist) {
  console.error('usage: node compare-amd.mjs <heft dist> <fast-serve output> [report.json]');
  process.exit(1);
}

function stub(name) {
  const target = function () {};
  return new Proxy(target, {
    get: (object, key) => {
      if (key === 'prototype') return object.prototype;
      if (key === Symbol.toPrimitive) return () => name;
      if (key === '__esModule') return true;
      if (typeof key === 'symbol') return undefined;
      return stub(`${name}.${key}`);
    },
    apply: () => stub(`${name}()`),
    construct: () => stub(`new ${name}`),
  });
}

function evaluate(source) {
  let captured;
  const sandbox = {
    define: (...args) => {
      const name = typeof args[0] === 'string' ? args.shift() : undefined;
      captured = { name, dependencies: args[0], factory: args[1] };
    },
    document: stub('document'),
    navigator: { userAgent: 'node' },
    location: { href: 'https://localhost/' },
    setTimeout: () => 0,
    requestAnimationFrame: () => 0,
    cancelAnimationFrame: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getComputedStyle: () => stub('style'),
    matchMedia: () => stub('media'),
    clearTimeout: () => undefined,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    Promise,
  };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox);
  if (!captured) return { name: undefined, dependencies: undefined, exports: undefined };
  let exports;
  try {
    const value = captured.factory(...captured.dependencies.map((name) => stub(name)));
    exports = Object.keys(value ?? {}).toSorted();
  } catch (error) {
    exports = `evaluation failed: ${error.message}`;
  }
  return { name: captured.name, dependencies: captured.dependencies, exports };
}

function bundles(folder, hashed) {
  const result = new Map();
  for (const file of readdirSync(folder)) {
    if (!file.endsWith('.js') || file.startsWith('chunk.') || /Strings_/.test(file)) continue;
    const name = hashed ? file.replace(/_[0-9a-f]{20}\.js$/, '') : file.replace(/\.js$/, '');
    if (hashed && name === file) continue;
    result.set(name, evaluate(readFileSync(path.join(folder, file), 'utf8')));
  }
  return result;
}

const heft = bundles(heftDist, true);
const ours = bundles(ourDist, false);
const report = [];
for (const name of [...new Set([...heft.keys(), ...ours.keys()])].toSorted()) {
  const h = heft.get(name);
  const o = ours.get(name);
  const heftDeps = new Set(h?.dependencies ?? []);
  const ourDeps = new Set(o?.dependencies ?? []);
  report.push({
    bundle: name,
    heftDefineName: h?.name,
    ourDefineName: o?.name,
    heftDependencies: h?.dependencies,
    ourDependencies: o?.dependencies,
    onlyHeft: [...heftDeps].filter((d) => !ourDeps.has(d)),
    onlyOurs: [...ourDeps].filter((d) => !heftDeps.has(d)),
    heftExports: h?.exports,
    ourExports: o?.exports,
    sameExports: JSON.stringify(h?.exports) === JSON.stringify(o?.exports),
  });
}
const text = JSON.stringify(report, null, 1);
if (reportFile) (await import('node:fs')).writeFileSync(reportFile, text);
for (const row of report) {
  console.log(`${row.bundle}: define name heft ${row.heftDefineName ?? 'anonymous'} ours ${row.ourDefineName ?? 'anonymous'}, only heft [${row.onlyHeft.join(', ')}], only ours [${row.onlyOurs.join(', ')}], exports heft ${JSON.stringify(row.heftExports)} ours ${JSON.stringify(row.ourExports)}`);
}
