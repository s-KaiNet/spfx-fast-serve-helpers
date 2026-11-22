import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { keepAmdExternalFactoriesSource } from './amdExternalFactories.js';
import { assignedGlobalObject, hotUpdateFanOutSource } from './sharedHotUpdateGlobal.js';

const GLOBAL = 'rspackHotUpdatefast_serve_0123456789abcdef';

function runtimeSource(bundle: string): string {
  return [
    'var waiting = {};',
    `waiting[${JSON.stringify(`${bundle}-chunk`)}] = true;`,
    `globalThis[${JSON.stringify(GLOBAL)}] = (chunkId, moreModules) => {`,
    '  if (waiting[chunkId]) globalThis.received.push([' + JSON.stringify(bundle) + ', chunkId, moreModules]);',
    '};',
  ].join('\n');
}

describe('assignedGlobalObject', () => {
  it('finds the object the runtime installs its hot-update handler on', () => {
    expect(assignedGlobalObject(runtimeSource('a'), GLOBAL)).toBe('globalThis');
    expect(assignedGlobalObject(`self[${JSON.stringify(GLOBAL)}] = function () {};`, GLOBAL)).toBe('self');
  });

  it('ignores runtime modules that only read or compare the global', () => {
    expect(assignedGlobalObject(`self[${JSON.stringify(GLOBAL)}](chunkId, modules);`, GLOBAL)).toBeUndefined();
    expect(assignedGlobalObject(`if (self[${JSON.stringify(GLOBAL)}] === undefined) {}`, GLOBAL)).toBeUndefined();
    expect(assignedGlobalObject(`self["rspackHotUpdateother"] = () => {};`, GLOBAL)).toBeUndefined();
  });
});

describe('hotUpdateFanOutSource', () => {
  it('delivers each hot-update chunk to the runtimes of every bundle on the page', () => {
    const page: Record<string, unknown> = { received: [] };
    const context = vm.createContext(page);
    for (const bundle of ['first', 'second']) vm.runInContext(`(function () {\n${runtimeSource(bundle)}\n${hotUpdateFanOutSource('globalThis', GLOBAL)}\n})();`, context);
    vm.runInContext(`globalThis[${JSON.stringify(GLOBAL)}]("first-chunk", { one: 1 }); globalThis[${JSON.stringify(GLOBAL)}]("second-chunk", { two: 2 });`, context);
    expect(JSON.parse(JSON.stringify(page.received))).toEqual([
      ['first', 'first-chunk', { one: 1 }],
      ['second', 'second-chunk', { two: 2 }],
    ]);
  });
});

function bundleSource(bundle: string, externals: string[]): string {
  return [
    '(function () {',
    `var __webpack_require__ = { m: { ${externals.map((name) => `${JSON.stringify(name)}: function ${bundle}Binding() {}`).join(', ')} } };`,
    runtimeSource(bundle),
    keepAmdExternalFactoriesSource('globalThis', GLOBAL, ['lib-a', 'lib-b']),
    hotUpdateFanOutSource('globalThis', GLOBAL),
    '})();',
  ].join('\n');
}

describe('keepAmdExternalFactoriesSource', () => {
  it('replaces a hot-update factory of an AMD external the bundle already has with its original factory, per bundle', () => {
    const page: Record<string, unknown> = { received: [] };
    const context = vm.createContext(page);
    vm.runInContext(bundleSource('first', ['lib-a']), context);
    vm.runInContext(bundleSource('second', ['lib-b']), context);
    vm.runInContext(
      `globalThis.update = { app: function app() {}, 'lib-a': function rebuilt() {}, 'lib-b': function rebuilt() {} };
      globalThis[${JSON.stringify(GLOBAL)}]("first-chunk", globalThis.update);
      globalThis[${JSON.stringify(GLOBAL)}]("second-chunk", globalThis.update);`,
      context,
    );
    const received = page.received as [string, string, Record<string, { name: string }>][];
    expect(received.map(([bundle, chunk, modules]) => [bundle, chunk, Object.fromEntries(Object.entries(modules).map(([id, factory]) => [id, factory.name]))])).toEqual([
      ['first', 'first-chunk', { app: 'app', 'lib-a': 'firstBinding', 'lib-b': 'rebuilt' }],
      ['second', 'second-chunk', { app: 'app', 'lib-a': 'rebuilt', 'lib-b': 'secondBinding' }],
    ]);
    expect(Object.values(page.update as Record<string, { name: string }>).map((factory) => factory.name)).toEqual(['app', 'rebuilt', 'rebuilt']);
  });

  it('passes updates without external factories through unchanged', () => {
    const page: Record<string, unknown> = { received: [] };
    const context = vm.createContext(page);
    vm.runInContext(bundleSource('first', ['lib-a']), context);
    vm.runInContext(`globalThis.update = { app: 1 }; globalThis[${JSON.stringify(GLOBAL)}]("first-chunk", globalThis.update);`, context);
    const received = page.received as [string, string, unknown][];
    expect(received.map(([, , modules]) => modules === page.update)).toEqual([true]);
  });
});
