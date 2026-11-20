import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { rspack } from '@rspack/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ConfigExternal, SpfxLibrary } from '../project/index.js';
import type { BrowserErrorReport } from './contracts.js';
import { codeFrame, formatBrowserError } from './format.js';
import { describeLoadError, type LoadErrorFacts } from './loadErrors.js';
import { BrowserErrorReporter, errorSignature } from './reporter.js';
import { BundleSourceMaps, sourceFilePath } from './sourceMaps.js';
import { parseStackFrames, servedFile } from './stackFrames.js';
import { parseReport } from './index.js';

const DIST = 'https://localhost:4431/dist/';

function report(overrides: Partial<BrowserErrorReport>): BrowserErrorReport {
  return { kind: 'error', name: 'Error', message: 'boom', stack: '', callStack: '', ...overrides };
}

function scriptError(module: string): BrowserErrorReport {
  return report({ kind: 'load-error', requireType: 'scripterror', requireModules: [module], message: `Script error for "${module}"` });
}

describe('stack frames', () => {
  it('reads V8 and Firefox frames', () => {
    expect(parseStackFrames(`TypeError: x\n    at Counter (${DIST}hello.js:12:15)\n    at async load (${DIST}hello.js:1:2)`)).toEqual([
      { method: 'Counter', url: `${DIST}hello.js`, line: 12, column: 15 },
      { method: 'load', url: `${DIST}hello.js`, line: 1, column: 2 },
    ]);
    expect(parseStackFrames(`render@${DIST}a.js:3:4\n@${DIST}b.js:5:6`).map(({ method }) => method)).toEqual(['render', '']);
  });

  it('knows which frames come from served bundles', () => {
    expect(servedFile(`${DIST}hello-web-part.js`, DIST)).toBe('hello-web-part.js');
    expect(servedFile(`${DIST}hello.0a1b.hot-update.js?x=1`, DIST)).toBe('hello.0a1b.hot-update.js');
    expect(servedFile('https://localhost:4431/temp/build/manifests.js', DIST)).toBeUndefined();
    expect(servedFile('https://res-1.cdn.office.net/files/sp-pages.js', DIST)).toBeUndefined();
  });

  it('maps an unmapped line to the next mapping only inside one module', async () => {
    const map = JSON.stringify({ version: 3, sources: ['webpack:///.././src/a.ts', 'webpack:///.././src/b.ts'], names: [], mappings: 'AAAA;;AAEA;;ACAA' });
    const sourceMaps = new BundleSourceMaps('/p', (file) => Promise.resolve(file === 'bundle.js.map' ? map : undefined), () => true);
    expect(await sourceMaps.originOf('bundle.js', 1, 5)).toEqual({ file: '/p/src/a.ts', line: 1, column: 1 });
    expect(await sourceMaps.originOf('bundle.js', 2, 5)).toEqual({ file: '/p/src/a.ts', line: 3 });
    expect(await sourceMaps.originOf('bundle.js', 3, 1)).toEqual({ file: '/p/src/a.ts', line: 3, column: 1 });
    expect(await sourceMaps.originOf('bundle.js', 4, 1)).toBeUndefined();
    expect(await sourceMaps.originOf('bundle.js', 6, 1)).toBeUndefined();
  });

  it('resolves webpack source names against the project root', () => {
    expect(sourceFilePath('/p', 'webpack:///.././src/a.tsx')).toBe('/p/src/a.tsx');
    expect(sourceFilePath('/home/u/p', 'webpack:///../../../../usr/lib/x.js')).toBe('/usr/lib/x.js');
    expect(sourceFilePath('/p', 'webpack:///../webpack/bootstrap')).toBe('/p/webpack/bootstrap');
  });
});

describe('formatBrowserError', () => {
  it('prints the error, its frames and one code frame', () => {
    const output = formatBrowserError(
      report({ name: 'TypeError', message: 'b is undefined' }),
      [
        { method: 'Counter', location: 'src/a.ts', sourceFile: '/p/src/a.ts', line: 3 },
        { method: '', location: 'node_modules/react-dom/cjs/react-dom.development.js', line: 100 },
      ],
      () => 'line 1\nline 2\nconst a = b.x;\nline 4\nline 5\nline 6',
    );
    expect(stripVTControlCharacters(output).split('\n')).toEqual([
      '[Unhandled error] TypeError: b is undefined',
      ' > Counter src/a.ts:3',
      '      1 | line 1',
      '      2 | line 2',
      '    > 3 | const a = b.x;',
      '      4 | line 4',
      '      5 | line 5',
      ' > node_modules/react-dom/cjs/react-dom.development.js:100',
    ]);
  });

  it('marks the column when the source map has one', () => {
    expect(codeFrame('a\nconst x = y;', 2, 11)).toEqual(['  1 | a', '> 2 | const x = y;', '    |           ^']);
  });
});

describe('describeLoadError', () => {
  const external: ConfigExternal = { name: 'ejs', source: { type: 'url', url: 'https://cdn.example.com/ejs.js' } };
  const localExternal: ConfigExternal = { name: 'chart', source: { type: 'file', file: '/p/externals/chart.js' } };
  const library: SpfxLibrary = { packageName: '@contoso/library', id: '2997f152-d79f-45c7-a7d2-ea768b8f5575', version: '1.2.0', packageDir: '/p/node_modules/@contoso/library' };
  const facts = (compileFailed = false): LoadErrorFacts => ({
    root: '/p',
    configExternals: new Map([
      ['ejs', external],
      ['chart', localExternal],
    ]),
    libraries: new Map([['@contoso/library', library]]),
    compileFailed,
  });

  it('names the config.json external or SPFx library whose script failed', () => {
    expect(describeLoadError(scriptError('abc_0.0.1/ejs'), facts()).reason).toContain('config.json external "ejs" (https://cdn.example.com/ejs.js)');
    expect(describeLoadError(scriptError('abc_0.0.1/chart'), facts()).reason).toContain('"chart" (externals/chart.js)');
    expect(describeLoadError(scriptError('2997f152-d79f-45c7-a7d2-ea768b8f5575_1.2.0'), facts()).reason).toContain('SPFx library "@contoso/library"');
    expect(describeLoadError(scriptError('other'), facts())).toEqual({ reason: 'the script "other" failed to load', showFrames: false });
  });

  it('points at the compile error when a module of the bundle failed to compile', () => {
    const thrown = report({ kind: 'load-error', requireType: 'define', message: '  × Module build failed (from builtin:swc-loader):\n  ╰─▶ x' });
    expect(describeLoadError(thrown, facts()).reason).toMatch(/^a module in it failed to compile/);
    expect(describeLoadError(report({ kind: 'load-error', requireType: 'define', name: 'TypeError', message: 'x is undefined' }), facts(true)).showFrames).toBe(false);
    expect(describeLoadError(report({ kind: 'load-error', requireType: 'define', name: 'TypeError', message: '\n x is undefined\nmore' }), facts())).toEqual({ reason: 'TypeError: x is undefined', showFrames: true });
  });
});

describe('parseReport', () => {
  it('accepts well-formed reports only', () => {
    const valid = { kind: 'load-error', name: 'Error', message: 'm', stack: '', callStack: '', bundle: 'b', requireType: 'define', requireModules: ['b', 3] };
    expect(parseReport(JSON.stringify(valid))).toEqual({ ...valid, requireModules: ['b'] });
    expect(parseReport(JSON.stringify({ ...valid, kind: 'other' }))).toBeUndefined();
    expect(parseReport(JSON.stringify({ ...valid, message: 1 }))).toBeUndefined();
    expect(parseReport('not json')).toBeUndefined();
  });
});

describe('BrowserErrorReporter', () => {
  let root: string;
  let bundleLine: number;
  let bundleColumn: number;
  const SOURCE = "interface IProps {\n  a: string;\n}\n\nexport function counter(props: IProps): string {\n  return props.a.toUpperCase();\n}\n";

  beforeAll(() => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-browser-errors-'));
    mkdirSync(path.join(root, 'src'));
    writeFileSync(path.join(root, 'src', 'counter.ts'), SOURCE);
    const { code, map = '' } = rspack.experiments.swc.transformSync(SOURCE, { filename: 'counter.ts', sourceMaps: true, jsc: { parser: { syntax: 'typescript' }, target: 'es2020' } });
    const payload = { ...(JSON.parse(map) as Record<string, unknown>), sources: ['webpack:///.././src/counter.ts'] };
    writeFileSync(path.join(root, 'bundle.js.map'), JSON.stringify(payload));
    mkdirSync(path.join(root, 'node_modules', 'pkg'), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', 'pkg', 'index.js'), SOURCE);
    writeFileSync(path.join(root, 'vendor.js.map'), JSON.stringify({ ...payload, sources: ['webpack:///.././node_modules/pkg/index.js'] }));
    const lines = code.split('\n');
    bundleLine = lines.findIndex((line) => line.includes('toUpperCase')) + 1;
    bundleColumn = (lines[bundleLine - 1]?.indexOf('props.a') ?? 0) + 1;
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  function reporter(overlay = true, now = () => 0, compileFailed = true) {
    const logged: string[] = [];
    const sourceMaps = new BundleSourceMaps(
      root,
      (file) => Promise.resolve(file.endsWith('.js.map') ? readFileSync(path.join(root, file), 'utf8') : undefined),
      () => true,
    );
    const facts: LoadErrorFacts = { root, configExternals: new Map(), libraries: new Map(), compileFailed };
    const instance = new BrowserErrorReporter({ root, distUrl: DIST, overlay, logger: { error: (message) => logged.push(stripVTControlCharacters(message)) }, sourceMaps, loadErrorFacts: () => facts, now });
    return { instance, logged };
  }

  const projectStack = () =>
    [`TypeError: x`, `    at counter (${DIST}bundle.js:${bundleLine}:${bundleColumn})`, `    at renderWithHooks (${DIST}vendor.js:10:2)`, '    at https://res-1.cdn.office.net/files/sp-pages.js:1:2'].join('\n');

  it('maps project frames to the TypeScript source and answers with overlay content', async () => {
    const { instance, logged } = reporter();
    const response = await instance.report(report({ name: 'TypeError', message: 'x', stack: projectStack() }));
    expect(logged).toHaveLength(1);
    expect(logged[0]?.split('\n').slice(0, 2)).toEqual(['[Unhandled error] TypeError: x', ' > counter src/counter.ts:6:10']);
    expect(logged[0]).toContain('> 6 |   return props.a.toUpperCase();');
    expect(logged[0]).not.toContain('sp-pages');
    expect(logged[0]).not.toContain('vendor.js');
    expect(response.overlay?.title).toBe('Uncaught runtime error');
    expect(response.overlay?.text).toBe(logged[0]);
  });

  it('counts frames from linked library projects as project frames', async () => {
    const libraryRoot = `${root}-corp-lib`;
    mkdirSync(path.join(libraryRoot, 'src'), { recursive: true });
    writeFileSync(path.join(libraryRoot, 'src', 'counter.ts'), SOURCE);
    const payload = JSON.parse(readFileSync(path.join(root, 'bundle.js.map'), 'utf8')) as Record<string, unknown>;
    writeFileSync(path.join(root, 'library.js.map'), JSON.stringify({ ...payload, sources: [`webpack:///../../${path.basename(libraryRoot)}/src/counter.ts`] }));
    try {
      const logged: string[] = [];
      const sourceMaps = new BundleSourceMaps(root, (file) => Promise.resolve(file.endsWith('.js.map') ? readFileSync(path.join(root, file), 'utf8') : undefined), () => true);
      const facts: LoadErrorFacts = { root, configExternals: new Map(), libraries: new Map(), compileFailed: false };
      const options = { root, distUrl: DIST, overlay: true, logger: { error: (message: string) => logged.push(stripVTControlCharacters(message)) }, sourceMaps, loadErrorFacts: () => facts };
      const stack = `TypeError: x\n    at counter (${DIST}library.js:${bundleLine}:${bundleColumn})`;
      expect(await new BrowserErrorReporter(options).report(report({ name: 'TypeError', message: 'x', stack }))).toEqual({});
      const response = await new BrowserErrorReporter({ ...options, codeRoots: [options.root, libraryRoot] }).report(report({ name: 'TypeError', message: 'x', stack }));
      expect(logged[0]?.split('\n').slice(0, 2)).toEqual(['[Unhandled error] TypeError: x', ` > counter ../${path.basename(libraryRoot)}/src/counter.ts:6:10`]);
      expect(logged[0]).toContain('> 6 |   return props.a.toUpperCase();');
      expect(response.overlay?.title).toBe('Uncaught runtime error');
    } finally {
      rmSync(libraryRoot, { recursive: true, force: true });
    }
  });

  it('drops errors without a project frame and keeps console.error out of the overlay', async () => {
    const { instance, logged } = reporter();
    expect(await instance.report(report({ stack: `Error: telemetry\n    at send (${DIST}vendor.js:3:1)\n    at https://contoso.sharepoint.com/sp.js:1:1` }))).toEqual({});
    expect(await instance.report(report({ stack: 'Error: x\n    at https://res-1.cdn.office.net/files/sp-pages.js:1:2' }))).toEqual({});
    expect(await instance.report(report({ stack: `Error: x\n    at log (${DIST}vendor.js:${bundleLine}:${bundleColumn})` }))).toEqual({});
    expect(logged).toEqual([]);
    expect(await instance.report(report({ kind: 'console-error', name: 'console.error', message: 'failed', callStack: projectStack() }))).toEqual({});
    expect(logged).toHaveLength(1);
  });

  it('suppresses an error repeated within two seconds and honours the overlay option', async () => {
    let now = 0;
    const { instance, logged } = reporter(false, () => now);
    const thrown = report({ name: 'TypeError', message: 'x', stack: projectStack() });
    expect(await instance.report(thrown)).toEqual({});
    now = 1000;
    await instance.report(thrown);
    now = 4000;
    await instance.report(thrown);
    expect(logged).toHaveLength(2);
  });

  it('answers a repeated error with the overlay again without printing it twice', async () => {
    const { instance, logged } = reporter();
    const thrown = report({ name: 'TypeError', message: 'useState1 is not a function', stack: projectStack() });
    const first = await instance.report(thrown);
    expect(await instance.report(thrown)).toEqual(first);
    expect(first.overlay?.title).toBe('Uncaught runtime error');
    expect(logged).toHaveLength(1);
  });

  it('reports bundle load failures with a page message', async () => {
    const { instance, logged } = reporter();
    const response = await instance.report(report({ kind: 'load-error', bundle: 'hello-web-part', requireType: 'define', message: 'Module build failed' }));
    expect(logged).toEqual(['[Bundle load error] bundle "hello-web-part" could not be loaded: a module in it failed to compile (the compile error is printed above); the page reloads after the fix']);
    expect(response.pageMessage).toBe('[fast-serve] bundle "hello-web-part" could not be loaded: a module in it failed to compile; the page reloads after the fix. Details are in the fast-serve terminal.');
    expect(response.overlay).toBeUndefined();
  });

  it('shows a bundle that failed to load because project code threw while it was evaluated in the overlay', async () => {
    const { instance, logged } = reporter(true, () => 0, false);
    const thrown = report({ kind: 'load-error', bundle: 'hello-web-part', requireType: 'define', name: 'TypeError', message: 'x', stack: projectStack() });
    const response = await instance.report(thrown);
    expect(logged[0]?.split('\n').slice(0, 2)).toEqual(['[Bundle load error] bundle "hello-web-part" could not be loaded: TypeError: x', ' > counter src/counter.ts:6:10']);
    expect(response.overlay).toEqual({ title: 'Bundle load error', text: logged[0] });
    expect(response.pageMessage).toBe('[fast-serve] bundle "hello-web-part" could not be loaded: TypeError: x. Details are in the fast-serve terminal.');
    expect(await instance.report(thrown)).toEqual(response);
    expect(logged).toHaveLength(1);
    const withoutProjectFrame = await instance.report({ ...thrown, message: 'vendor', stack: `TypeError: vendor\n    at send (${DIST}vendor.js:3:1)` });
    expect(withoutProjectFrame.overlay).toBeUndefined();
    expect(await reporter(false, () => 0, false).instance.report(thrown)).toEqual({ pageMessage: response.pageMessage });
  });

  it('prints a module that failed during a hot update with a hint about the stale page and shows it in the overlay', async () => {
    const { instance, logged } = reporter();
    const response = await instance.report(report({ kind: 'hot-update-error', name: 'ReferenceError', message: 'asdfsdf is not defined', stack: projectStack() }));
    expect(logged[0]?.split('\n').slice(0, 3)).toEqual([
      '[Hot update error] ReferenceError: asdfsdf is not defined',
      'the page keeps running the previous version of this module until the error is fixed',
      ' > counter src/counter.ts:6:10',
    ]);
    expect(response.overlay).toEqual({ title: 'Updated module failed to run', text: logged[0] });
  });

  it('treats React replays of one render error as the same error', () => {
    const frames = [{ method: 'Counter', location: 'src/counter.ts', sourceFile: '/p/src/counter.ts', line: 6 }];
    expect(errorSignature(report({ kind: 'unhandled-rejection' }), frames)).toBe(errorSignature(report({}), frames));
    expect(errorSignature(report({ kind: 'console-error' }), frames)).not.toBe(errorSignature(report({}), frames));
  });
});
