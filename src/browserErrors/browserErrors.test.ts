import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { runInNewContext } from 'node:vm';
import { createServer, type ViteDevServer } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { BrowserErrorReport } from '../runtime/contracts.js';
import { readRuntimeSource } from '../utils/runtimeSource.js';
import { createRequire } from 'node:module';
import { codeFrame, formatBrowserError, overlayError } from './format.js';
import { BROWSER_ERROR_EVENT, browserErrorsPlugin, describeBrowserError, errorSignature, showsOverlay } from './index.js';
import { rewriteOverlayHint } from './overlayHint.js';
import { frameSource, parseStackFrames, referencesProjectCode } from './stackFrames.js';

const ORIGIN = 'https://localhost:4321';

function report(overrides: Partial<BrowserErrorReport>): BrowserErrorReport {
  return { kind: 'error', name: 'Error', message: 'boom', stack: '', callStack: '', ...overrides };
}

const projectStack = [
  "TypeError: Cannot read properties of undefined (reading 'x')",
  `    at Counter (${ORIGIN}/src/webparts/hello/components/Counter.tsx?t=1731870000:12:15)`,
  `    at renderWithHooks (${ORIGIN}/node_modules/.vite/deps/react-dom.js?v=abc:100:22)`,
  '    at https://res-1.cdn.office.net/files/sp-client/sp-pages-assembly.js:1:2',
].join('\n');

const telemetryStack = [
  'TypeError: Failed to fetch',
  `    at PnPTelemetry.<anonymous> (${ORIGIN}/node_modules/.vite/deps/@pnp_telemetry-js.js?v=abc:93:57)`,
  `    at step (${ORIGIN}/node_modules/.vite/deps/@pnp_telemetry-js.js?v=abc:32:22)`,
].join('\n');

const sharePointStack = [
  'Error: ShellException: IFrameRequest timed out',
  '    at e.t (https://res-1.cdn.office.net/files/odsp-web-prod_2026-11-10/summarizer-worker.js:2:3456)',
  '    at async https://mastaq.sharepoint.com/_layouts/15/sp-pages.js:1:99',
].join('\n');

describe('parseStackFrames', () => {
  it('reads V8 and Firefox frames', () => {
    expect(parseStackFrames(projectStack)[0]).toEqual({ method: 'Counter', url: `${ORIGIN}/src/webparts/hello/components/Counter.tsx?t=1731870000`, line: 12, column: 15 });
    expect(parseStackFrames(`render@${ORIGIN}/src/a.ts:3:4\n@${ORIGIN}/src/b.ts:5:6`)).toEqual([
      { method: 'render', url: `${ORIGIN}/src/a.ts`, line: 3, column: 4 },
      { method: '', url: `${ORIGIN}/src/b.ts`, line: 5, column: 6 },
    ]);
    expect(parseStackFrames(`    at async load (${ORIGIN}/src/a.ts:1:2)`)[0]?.method).toBe('load');
  });
});

describe('frameSource', () => {
  it('tells project modules from the loader, dependencies, Vite internals and other origins', () => {
    expect(frameSource(`${ORIGIN}/src/a.tsx?t=1`, ORIGIN)).toBe('project');
    expect(frameSource(`${ORIGIN}/@spfx/bundle/hello-web-part.js`, ORIGIN)).toBe('loader');
    expect(frameSource(`${ORIGIN}/node_modules/.vite/deps/react-dom.js?v=1`, ORIGIN)).toBe('dependency');
    expect(frameSource(`${ORIGIN}/@vite/client`, ORIGIN)).toBe('other');
    expect(frameSource(`${ORIGIN}/@id/__x00__virtual:fast-serve/browser-errors`, ORIGIN)).toBe('other');
    expect(frameSource('https://localhost:4322/src/a.ts', ORIGIN)).toBe('other');
    expect(frameSource('https://mastaq.sharepoint.com/src/a.js', ORIGIN)).toBe('other');
  });
});

describe('referencesProjectCode', () => {
  it('forwards errors raised in project modules or in the fast-serve loader', () => {
    expect(referencesProjectCode([projectStack, ''], ORIGIN)).toBe(true);
    expect(referencesProjectCode(['', `Error: console.error call site\n    at ${ORIGIN}/@id/__x00__virtual:fast-serve/browser-errors:40:5\n    at load (${ORIGIN}/src/data.ts:8:3)`], ORIGIN)).toBe(true);
    expect(referencesProjectCode([`Error: [fast-serve] Failed to load bundle\n    at ${ORIGIN}/@spfx/bundle/hello-web-part.js:120:9`, ''], ORIGIN)).toBe(true);
  });

  it('drops SharePoint errors, third-party telemetry and errors without a stack', () => {
    expect(referencesProjectCode([sharePointStack, ''], ORIGIN)).toBe(false);
    expect(referencesProjectCode([telemetryStack, ''], ORIGIN)).toBe(false);
    expect(referencesProjectCode(['', ''], ORIGIN)).toBe(false);
    expect(referencesProjectCode(['', `Error: console.error call site\n    at ${ORIGIN}/@id/__x00__virtual:fast-serve/browser-errors:40:5\n    at e.log (https://res-1.cdn.office.net/files/sp-client/sp-pages.js:1:2)`], ORIGIN)).toBe(false);
  });
});

describe('formatBrowserError', () => {
  it('prints the error, its frames and a code frame for the first frame with a source', () => {
    const source = 'line 1\nline 2\nconst a = b.x;\nline 4\nline 5\nline 6';
    const output = formatBrowserError(
      report({ name: 'TypeError', message: 'b is undefined' }),
      [
        { method: 'Counter', location: 'src/a.ts', sourceFile: '/p/src/a.ts', line: 3, column: 11 },
        { method: '', location: 'node_modules/.vite/deps/react-dom.js', line: 100, column: 2 },
      ],
      () => source,
    );
    expect(stripVTControlCharacters(output).split('\n')).toEqual([
      '[Unhandled error] TypeError: b is undefined',
      ' > Counter src/a.ts:3:11',
      '      1 | line 1',
      '      2 | line 2',
      '    > 3 | const a = b.x;',
      '        |           ^',
      '      4 | line 4',
      '      5 | line 5',
      ' > node_modules/.vite/deps/react-dom.js:100:2',
    ]);
  });

  it('labels rejections and console errors', () => {
    expect(stripVTControlCharacters(formatBrowserError(report({ kind: 'unhandled-rejection', message: 'x' }), [], () => undefined))).toBe('[Unhandled rejection] Error: x');
    expect(stripVTControlCharacters(formatBrowserError(report({ kind: 'console-error', message: 'Loading failed 42' }), [], () => undefined))).toBe('[console.error] Loading failed 42');
  });

  it('keeps the code frame inside the file', () => {
    expect(codeFrame('only line', 1, 1)).toEqual(['> 1 | only line', '    | ^']);
  });
});

describe('overlayError', () => {
  const frames = [
    { method: 'HelloWorld', location: 'src/HelloWorld.tsx', sourceFile: '/p/src/HelloWorld.tsx', line: 2, column: 5 },
    { method: 'render', location: 'src/HelloWorldWebPart.ts', sourceFile: '/p/src/HelloWorldWebPart.ts', line: 9, column: 1 },
  ];

  it('gives Vite\'s overlay the message, the source location, a code frame and the project frames', () => {
    const error = overlayError(report({ name: 'ReferenceError', message: 'printText is not defined' }), frames, (file) => (file === '/p/src/HelloWorld.tsx' ? 'a\nb(printText)\nc' : undefined));
    expect(error).toEqual({
      message: '[Unhandled error] ReferenceError: printText is not defined',
      loc: { file: '/p/src/HelloWorld.tsx', line: 2, column: 5 },
      frame: ['1 | a', '2 | b(printText)', '  |     ^', '3 | c'].join('\n'),
      stack: ['    at HelloWorld (/p/src/HelloWorld.tsx:2:5)', '    at render (/p/src/HelloWorldWebPart.ts:9:1)'].join('\n'),
    });
  });

  it('shows the served location when a frame has no source file, and only the message without frames', () => {
    const served = [{ method: '', location: '@spfx/bundle/hello.js', line: 4, column: 2 }];
    expect(overlayError(report({ kind: 'unhandled-rejection', message: 'x' }), served, () => undefined)).toEqual({
      message: '[Unhandled rejection] Error: x',
      loc: { file: '@spfx/bundle/hello.js', line: 4, column: 2 },
      stack: '    at (@spfx/bundle/hello.js:4:2)',
    });
    expect(overlayError(report({}), [], () => undefined)).toEqual({ message: '[Unhandled error] Error: boom', stack: '' });
  });

  it('is shown for uncaught errors and rejections, not for console.error calls', () => {
    expect(showsOverlay(report({ kind: 'error' }))).toBe(true);
    expect(showsOverlay(report({ kind: 'unhandled-rejection' }))).toBe(true);
    expect(showsOverlay(report({ kind: 'console-error' }))).toBe(false);
  });

  it('treats React\'s repeated reports of one render error as the same error', () => {
    const replayed = errorSignature(report({ name: 'ReferenceError', message: 'printText is not defined' }), frames);
    expect(errorSignature(report({ name: 'ReferenceError', message: 'printText is not defined' }), frames.slice(0, 1))).toBe(replayed);
    expect(errorSignature(report({ kind: 'unhandled-rejection', name: 'ReferenceError', message: 'printText is not defined' }), frames)).toBe(replayed);
    expect(errorSignature(report({ kind: 'console-error', name: 'ReferenceError', message: 'printText is not defined' }), frames)).not.toBe(replayed);
    expect(errorSignature(report({ name: 'ReferenceError', message: 'printText is not defined' }), frames.slice(1))).not.toBe(replayed);
  });
});

describe('overlay hint', () => {
  it('points the hint of Vite\'s overlay at config/fast-serve.json', () => {
    const clientFile = createRequire(import.meta.url).resolve('vite').replace(/dist[\\/]node[\\/]index\.js$/, 'dist/client/client.mjs');
    const client = readFileSync(clientFile, 'utf8');
    expect(client).toContain('const hmrConfigName = __HMR_CONFIG_NAME__;');
    expect(client).toContain('h("code", { part: "config-option-name" }, "server.hmr.overlay")');
    const rewritten = rewriteOverlayHint(client);
    expect(rewritten).toContain('const hmrConfigName = "config/fast-serve.json";');
    expect(rewritten).toContain('h("code", { part: "config-option-name" }, "overlay")');
  });
});

describe('describeBrowserError in Vite', () => {
  let projectRoot: string | undefined;
  let server: ViteDevServer | undefined;

  afterEach(async () => {
    await server?.close();
    if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
    server = undefined;
    projectRoot = undefined;
  });

  it('maps project frames back to the TypeScript source', async () => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-browser-errors-'));
    const file = path.join(projectRoot, 'src/counter.ts');
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, "interface IProps {\n  a: string;\n}\n\nexport function counter(props: IProps): string {\n  return props.a.toUpperCase();\n}\n");
    server = await createServer({ root: projectRoot, configFile: false, logLevel: 'silent', server: { middlewareMode: true, ws: false } });
    const transformed = await server.environments.client.transformRequest('/src/counter.ts');
    const generatedLines = transformed?.code.split('\n') ?? [];
    const line = generatedLines.findIndex((text) => text.includes('toUpperCase')) + 1;
    const column = (generatedLines[line - 1]?.indexOf('props.a') ?? 0) + 1;

    const stack = [
      'TypeError: x',
      `    at counter (${ORIGIN}/src/counter.ts?t=123:${line}:${column})`,
      `    at invokeGuardedCallback (${ORIGIN}/node_modules/.vite/deps/react-dom.js?v=1:3199:32)`,
      '    at https://contoso.sharepoint.com/sp.js:1:1',
    ].join('\n');
    const output = stripVTControlCharacters(await describeBrowserError(server.environments.client, projectRoot, ORIGIN, report({ name: 'TypeError', message: 'x', stack })));
    expect(output.split('\n').slice(0, 2)).toEqual(['[Unhandled error] TypeError: x', ' > counter src/counter.ts:6:10']);
    expect(output).toContain('> 6 |   return props.a.toUpperCase();');
    expect(output).not.toContain('sharepoint.com');
    expect(output).not.toContain('react-dom');
  });

  it('serves Vite\'s client with the fast-serve overlay hint and the overlay option', async () => {
    projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-browser-errors-'));
    const clientCode = async (overlay: boolean) => {
      server = await createServer({
        root: projectRoot,
        configFile: false,
        logLevel: 'silent',
        server: { middlewareMode: true, ws: false },
        plugins: browserErrorsPlugin({ root: projectRoot ?? tmpdir(), options: resolveOptions({ cli: { overlay } }, {}) }),
      });
      const code = (await server.environments.client.transformRequest('/@vite/client'))?.code ?? '';
      await server.close();
      return code;
    };
    const enabled = await clientCode(true);
    expect(enabled).toContain('const hmrConfigName = "config/fast-serve.json";');
    expect(enabled).toContain('"overlay")');
    expect(enabled).toContain('const enableOverlay = true;');
    expect(await clientCode(false)).toContain('const enableOverlay = false;');
  });
});

async function evaluateRuntime() {
  const code = (await readRuntimeSource('browserErrors')).replaceAll('import.meta.hot', 'hot').replace(/^export /m, '');
  const sent: { event: string; data: BrowserErrorReport }[] = [];
  const listeners = new Map<string, (event: unknown) => void>();
  const logged: unknown[][] = [];
  const console = { error: (...args: unknown[]) => logged.push(args) };
  const window = { addEventListener: (type: string, listener: (event: unknown) => void) => listeners.set(type, listener) };
  const hot = { send: (event: string, data: BrowserErrorReport) => sent.push({ event, data }) };
  runInNewContext(code, { window, console, hot, Error, JSON, Object, String });
  return { sent, listeners, logged, console };
}

describe('browser errors runtime', () => {
  it('sends errors, rejections and console errors with their stacks', async () => {
    const { sent, listeners, logged: consoleCalls, console } = await evaluateRuntime();
    const thrown = new TypeError('bad');
    listeners.get('error')?.({ error: thrown, message: 'bad', filename: '', lineno: 0, colno: 0 });
    listeners.get('error')?.({ error: null, message: 'Script error.', filename: `${ORIGIN}/src/a.ts`, lineno: 3, colno: 4 });
    listeners.get('unhandledrejection')?.({ reason: 'plain string' });
    const logged = new TypeError('bad');
    console.error('Loading failed', logged);

    expect(sent.every(({ event }) => event === BROWSER_ERROR_EVENT)).toBe(true);
    expect(sent.map(({ data }) => [data.kind, data.name, data.message])).toEqual([
      ['error', 'TypeError', 'bad'],
      ['error', 'Error', 'Script error.'],
      ['unhandled-rejection', 'Error', 'plain string'],
      ['console-error', 'console.error', 'Loading failed TypeError: bad'],
    ]);
    expect(sent[0]?.data.stack).toBe(thrown.stack);
    expect(sent[1]?.data.stack).toBe(`    at ${ORIGIN}/src/a.ts:3:4`);
    expect(sent[3]?.data.stack).toBe(logged.stack);
    expect(sent[3]?.data.callStack).toContain('console.error call site');
    expect(consoleCalls).toEqual([['Loading failed', logged]]);
  });

  it('does not send messages fast-serve or Vite already reported', async () => {
    const { sent, console } = await evaluateRuntime();
    console.error('[fast-serve] TypeScript types are re-exported as values');
    console.error('[vite]', new Error('send was called before connect'));
    console.error('[vite] Internal Server Error');
    const reportedByServer = Object.defineProperty(new Error('compile error'), Symbol.for('fast-serve.reported-in-terminal'), { value: true });
    console.error(reportedByServer);
    expect(sent).toEqual([]);
  });

  it('sends each error object once, however often the page logs it', async () => {
    const { sent, listeners, console } = await evaluateRuntime();
    const failure = new Error('[fast-serve] Failed to load bundle');
    console.error(failure);
    console.error('Could not load hello-world-web-part in require.', failure);
    listeners.get('unhandledrejection')?.({ reason: failure });
    expect(sent.map(({ data }) => data.message)).toEqual(['Error: [fast-serve] Failed to load bundle']);
  });
});
