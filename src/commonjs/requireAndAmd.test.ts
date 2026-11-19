import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { copyCompileFixture, fakeExternals, TEST_ORIGIN, type FixtureCopy } from '../testing/compileKit.js';

const ejsExternal = { render: (template: string) => `rendered ${template}` };
const pageExternals: Record<string, unknown> = { ...fakeExternals, ejs: ejsExternal };

const WEB_PART = `
declare const require: (id: string) => any;
import * as lodashNamespace from 'lodash';

const cjs = require('cjs-package');
const esm = require('esm-package');
const umd = require('umd-package');
const lodash = require('lodash');
const data = require('./data.json');
const logo = require('./assets/logo.png');
const spCore = require('@microsoft/sp-core-library');
const viaDependency = require('uses-spfx');
require('side-effect-package');

export default class HelloWebPart {}
export const results = { cjs, esm, umd, lodash, lodashNamespace, data, logo, spCore, viaDependency };
`;

const UMD_WITH_AMD_FIRST = `(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Umd = factory();
  }
})(this, function () {
  return { branch: 'amd' };
});
`;

interface PageRequireJs {
  calls: number;
  exports: Record<string, unknown>;
  globals: Record<string, unknown>;
}

function loadWithPageRequireJs(source: string): PageRequireJs {
  let factoryResult: Record<string, unknown> | undefined;
  let calls = 0;
  const define = Object.assign(
    (dependencies: string[], factory: (...modules: unknown[]) => Record<string, unknown>) => {
      calls++;
      if (calls > 1) throw new Error('Mismatched anonymous define() module');
      factoryResult = factory(...dependencies.map((name) => pageExternals[name]));
    },
    { amd: { jQuery: true } },
  );
  const globals: Record<string, unknown> = { define, setTimeout: () => 0 };
  globals.self = globals;
  globals.window = globals;
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  if (!factoryResult) throw new Error('the bundle did not call define()');
  return { calls, exports: factoryResult, globals: vm.runInContext('globalThis', context) as Record<string, unknown> };
}

describe('require() and AMD in dependencies keep webpack semantics', () => {
  let copy: FixtureCopy;
  let page: PageRequireJs;
  let dependencies: string[] = [];
  let results: Record<string, unknown>;
  let errors: string[] = [];

  beforeAll(async () => {
    copy = copyCompileFixture({
      'src/webparts/hello/HelloWebPart.ts': WEB_PART,
      'src/webparts/hello/data.json': { color: 'teal' },
      'node_modules/cjs-package/package.json': { name: 'cjs-package', version: '1.0.0', main: 'index.js' },
      'node_modules/cjs-package/index.js': "module.exports = function cjs() { return 'cjs'; };\nmodule.exports.flag = true;\n",
      'node_modules/esm-package/package.json': { name: 'esm-package', version: '1.0.0', type: 'module', exports: './index.js' },
      'node_modules/esm-package/index.js': "export const named = 'esm';\nexport default 'esm default';\n",
      'node_modules/umd-package/package.json': { name: 'umd-package', version: '1.0.0', main: 'umd.js' },
      'node_modules/umd-package/umd.js': UMD_WITH_AMD_FIRST,
      'node_modules/uses-spfx/package.json': { name: 'uses-spfx', version: '1.0.0', main: 'index.js' },
      'node_modules/uses-spfx/index.js': "const core = require('@microsoft/sp-core-library');\nmodule.exports = { Version: core.Version, ejs: require('ejs') };\n",
      'node_modules/side-effect-package/package.json': { name: 'side-effect-package', version: '1.0.0', main: 'index.js' },
      'node_modules/side-effect-package/index.js': 'globalThis.sideEffectRan = true;\n',
    });
    const config = JSON.parse(copy.read('config/config.json')) as Record<string, unknown>;
    copy.write('config/config.json', { ...config, externals: { ejs: 'https://cdn.example.com/ejs.min.js' } });
    copy.linkPackage('lodash');
    const { result, bundle } = await copy.compile();
    errors = result.errors;
    page = loadWithPageRequireJs(bundle('single-web-part'));
    dependencies = [...new Set((/^define\((\[[^\]]*\])/m.exec(bundle('single-web-part'))?.[1] ?? '[]').match(/"[^"]+"/g) ?? [])].map((name) => JSON.parse(name) as string);
    results = page.exports.results as Record<string, unknown>;
  }, 60_000);

  afterAll(() => {
    copy.remove();
  });

  it('compiles without errors and calls the page define() only for the bundle itself', () => {
    expect(errors).toEqual([]);
    expect(page.calls).toBe(1);
  });

  it('gives module.exports for CommonJS packages and the namespace for ES modules', () => {
    expect(typeof results.cjs).toBe('function');
    expect((results.cjs as () => string)()).toBe('cjs');
    expect((results.cjs as { flag: boolean }).flag).toBe(true);
    expect({ ...(results.esm as object) }).toEqual({ named: 'esm', default: 'esm default' });
    expect(page.globals.sideEffectRan).toBe(true);
  });

  it('gives parsed JSON and the dev server URL of an asset', () => {
    expect(results.data).toEqual({ color: 'teal' });
    expect(results.logo).toMatch(new RegExp(`^${TEST_ORIGIN}/dist/logo_[0-9a-f]+\\.png$`));
  });

  it("runs the AMD branch of UMD dependencies against webpack's own define, not the page's RequireJS", () => {
    expect(results.umd).toEqual({ branch: 'amd' });
  });

  it('runs the full lodash build like heft: a working lodash, also set as the global _', () => {
    const lodash = results.lodash as { chunk: (items: number[], size: number) => number[][]; VERSION: string };
    expect(lodash.chunk([1, 2, 3], 2)).toEqual([[1, 2], [3]]);
    expect(lodash.VERSION).toMatch(/^4\./);
    expect((results.lodashNamespace as { chunk: unknown }).chunk).toBe(lodash.chunk);
    expect(page.globals._).toBe(lodash);
  });

  it('keeps SPFx libraries and config.json externals required from project code or CommonJS dependencies as externals', () => {
    expect(dependencies).toEqual(expect.arrayContaining(['@microsoft/sp-core-library', 'ejs']));
    expect(results.spCore).toBe(pageExternals['@microsoft/sp-core-library']);
    expect(results.viaDependency).toEqual({ Version: (pageExternals['@microsoft/sp-core-library'] as { Version: unknown }).Version, ejs: ejsExternal });
  });
});
