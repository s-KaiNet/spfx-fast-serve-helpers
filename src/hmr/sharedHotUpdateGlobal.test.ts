import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
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
