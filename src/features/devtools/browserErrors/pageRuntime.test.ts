import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createFakePage, FakeNode, type FakePage } from '../../../../test/kit/fakePage.js';
import type { BrowserErrorReport, BrowserErrorResponse, PageRuntimeConfig } from './contracts.js';
import { renderPageScript } from './pageScript.js';

const ORIGIN = 'https://localhost:4431';
const DIST = `${ORIGIN}/dist/`;
const CONFIG: PageRuntimeConfig = {
  origin: ORIGIN,
  distUrl: DIST,
  reportUrl: `${ORIGIN}/fast-serve/browser-errors`,
  overlay: true,
  bundles: { 'hello-web-part': ['c0ffee00-0000-4000-8000-000000000001'] },
};

interface RuntimePage {
  page: FakePage;
  sent: BrowserErrorReport[];
  overlays: () => FakeNode[];
  console: { error: (...args: unknown[]) => void };
}

type Responder = (report: BrowserErrorReport) => BrowserErrorResponse | Promise<BrowserErrorResponse>;

function startPage(config: PageRuntimeConfig = CONFIG, respond: Responder = () => ({}), globals: Record<string, unknown> = {}): RuntimePage {
  const sent: BrowserErrorReport[] = [];
  const page = createFakePage({
    externals: {},
    fetch: (url, init) => {
      if (url !== config.reportUrl || typeof init?.body !== 'string') return Promise.reject(new Error(`unexpected fetch ${url}`));
      const report = JSON.parse(init.body) as BrowserErrorReport;
      sent.push(report);
      return Promise.resolve(respond(report)).then((answer) => new Response(JSON.stringify(answer)));
    },
  });
  Object.assign(page.globals, globals);
  page.evaluate(renderPageScript(config));
  return {
    page,
    sent,
    overlays: () => page.body.childNodes.filter((node) => node.id === 'fast-serve-error-overlay'),
    console: page.globals.console as RuntimePage['console'],
  };
}

function overlayText(host: FakeNode | undefined): string {
  return host?.shadowRoot?.text ?? '';
}

function devServerMessage(page: FakePage, data: unknown): void {
  page.dispatch('message', { data, source: page.window });
}

function rebuild(page: FakePage, result: 'webpackOk' | 'webpackWarnings' | 'webpackStillOk', clients = 1): void {
  for (let client = 0; client < clients; client++) devServerMessage(page, { type: 'webpackInvalid' });
  for (let client = 0; client < clients; client++) devServerMessage(page, result === 'webpackWarnings' ? { type: result, data: ['warning'] } : { type: result });
}

function throwFromBundle(page: FakePage, message: string): void {
  page.dispatch('error', { error: Object.assign(new Error(message), { stack: `Error: ${message}\n    at Second (${DIST}hello-web-part.js:9:5)` }) });
}

const TYPE_EVENTS_URL = `${ORIGIN}/fast-serve/type-check`;
const TYPE_CONFIG: PageRuntimeConfig = { ...CONFIG, typeCheckEventsUrl: TYPE_EVENTS_URL };
const ONE_TYPE_ERROR = { title: 'Type check: 1 error', text: "type error in src/a.ts:1:1\nTS2304: Cannot find name 'x'." };
const TWO_TYPE_ERRORS = { title: 'Type check: 2 errors', text: `${ONE_TYPE_ERROR.text}\n\ntype error in src/b.ts:1:1\nTS2322: Type 'string' is not assignable to type 'number'.` };

class FakeEventSource {
  static readonly opened: FakeEventSource[] = [];
  private readonly listeners: ((event: { data: unknown }) => void)[] = [];

  constructor(readonly url: string) {
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: (event: { data: unknown }) => void): void {
    if (type === 'message') this.listeners.push(listener);
  }

  send(data: unknown): void {
    for (const listener of this.listeners) listener({ data: JSON.stringify(data) });
  }
}

interface TypePage extends RuntimePage {
  types: FakeEventSource;
  source: () => string | null | undefined;
}

function startTypePage(config: PageRuntimeConfig = TYPE_CONFIG, respond: Responder = () => ({})): TypePage {
  FakeEventSource.opened.length = 0;
  const started = startPage(config, respond, { EventSource: FakeEventSource });
  const [types] = FakeEventSource.opened;
  if (types === undefined) throw new Error('the page runtime opened no type check event stream');
  return { ...started, types, source: () => started.overlays()[0]?.getAttribute('data-source') };
}

const RUNTIME_OVERLAY: Responder = (report) => ({ overlay: { title: 'Uncaught runtime error', text: `[Unhandled error] ${report.name}: ${report.message}` } });

describe('fast-serve page runtime', () => {
  it('makes RequireJS load served bundles with CORS so their errors are not muted as "Script error."', () => {
    const page = createFakePage({ externals: {}, fetch: () => Promise.reject(new Error('no fetch')) });
    const created: { crossOrigin: string | null; url: string }[] = [];
    page.globals.requirejs = {
      createNode(_config: unknown, _moduleName: string, url: string) {
        const node = { crossOrigin: null, url };
        created.push(node);
        return node;
      },
    };
    page.evaluate(renderPageScript(CONFIG));
    const loader = page.globals.requirejs as { createNode(config: unknown, moduleName: string, url: string): unknown };
    loader.createNode({}, 'hello', `${DIST}hello-web-part.js`);
    loader.createNode({}, 'sp-pages', 'https://res-1.cdn.office.net/files/sp-pages.js');
    expect(created).toEqual([
      { crossOrigin: 'anonymous', url: `${DIST}hello-web-part.js` },
      { crossOrigin: null, url: 'https://res-1.cdn.office.net/files/sp-pages.js' },
    ]);
  });

  it('forwards errors with a frame in a served bundle once per error object', async () => {
    const { page, sent } = startPage();
    const thrown = Object.assign(new Error('boom'), { stack: `Error: boom\n    at render (${DIST}hello-web-part.js:10:5)` });
    page.dispatch('error', { error: thrown, message: 'boom' });
    page.dispatch('unhandledrejection', { reason: thrown });
    page.dispatch('error', { error: new Error('sharepoint'), message: 'sharepoint' });
    page.dispatch('error', { error: null, message: 'Script error.', filename: `${DIST}hello-web-part.js`, lineno: 3, colno: 4 });
    page.dispatch('unhandledrejection', { reason: 'text without a stack' });
    await delay(10);
    expect(sent.map(({ kind, message, stack }) => [kind, message, stack])).toEqual([
      ['error', 'boom', thrown.stack],
      ['error', 'Script error.', `    at ${DIST}hello-web-part.js:3:4`],
    ]);
  });

  it('forwards console.error calls made from bundle code and keeps logging them', async () => {
    const { page, sent, console } = startPage();
    page.evaluate("function fromBundle() { console.error('failed', 42); }", `${DIST}hello-web-part.js`);
    page.evaluate('fromBundle()');
    console.error('from SharePoint');
    page.evaluate("function devServerClient() { console.error('[rspack-dev-server] Errors while compiling.'); }\ndevServerClient();", `${DIST}hello-web-part.js`);
    await delay(10);
    expect(page.logs).toEqual(['error: failed 42', 'error: from SharePoint', 'error: [rspack-dev-server] Errors while compiling.']);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'console-error', message: 'failed 42', stack: '' });
    expect(sent[0]?.callStack).toContain(`${DIST}hello-web-part.js`);
  });

  it('shows an Error logged while a bundle applies a hot update as a failed update, other console.error calls stay in the terminal', async () => {
    const { page, sent, overlays } = startPage(CONFIG, (report) => (report.kind === 'console-error' ? {} : { overlay: { title: 'Updated module failed to run', text: report.message } }));
    page.evaluate(
      [
        'function moduleError(message) { const error = new ReferenceError(message); error.stack = `ReferenceError: ${message}\\n    at ./src/Second.tsx (' + DIST + 'hello-web-part.0a1b.hot-update.js:13:1)`; return error; }',
        'function hotErrorHandler(error) { console.error(error); }',
        'function logText(text) { console.error(text); }',
        "function caughtByProjectCode() { console.error(moduleError('handled')); console.error('failed', 42); }",
      ].join('\n'),
      `${DIST}hello-web-part.js`,
    );
    page.evaluate('caughtByProjectCode()');
    page.evaluate("globalThis[Symbol.for('fast-serve.hot-update.applying-bundles')] = new Set([{}]); hotErrorHandler(moduleError('asdfsdf is not defined')); logText('during the update');");
    page.evaluate("globalThis[Symbol.for('fast-serve.hot-update.applying-bundles')].clear(); hotErrorHandler(moduleError('after the update'));");
    await delay(10);
    expect(sent.map(({ kind, message }) => [kind, message])).toEqual([
      ['console-error', 'ReferenceError: handled'],
      ['console-error', 'failed 42'],
      ['hot-update-error', 'asdfsdf is not defined'],
      ['console-error', 'during the update'],
      ['console-error', 'ReferenceError: after the update'],
    ]);
    expect(sent[2]?.stack).toContain('hot-update.js:13:1');
    expect(overlays()).toHaveLength(1);
    expect(overlayText(overlays()[0])).toContain('asdfsdf is not defined');
  });

  it('installs itself once per page', async () => {
    const { page, sent } = startPage();
    page.evaluate(renderPageScript(CONFIG));
    page.dispatch('error', { error: Object.assign(new Error('x'), { stack: `Error: x\n    at ${DIST}a.js:1:1` }) });
    await delay(10);
    expect(sent).toHaveLength(1);
  });

  it('reports a bundle that failed to load in RequireJS and makes the web part error readable', async () => {
    const pageMessage = '[fast-serve] bundle "hello-web-part" could not be loaded: reason.';
    const { page, sent, console } = startPage(CONFIG, () => ({ pageMessage }));
    const unreadable = Object.assign(new FakeNode('#text'), { textContent: 'ERROR:[object Object]' });
    const errorBox = new FakeNode('div');
    errorBox.appendChild(unreadable);
    const selectors: string[] = [];
    Object.assign(page.globals.document as object, {
      querySelectorAll: (selector: string) => {
        selectors.push(selector);
        return [errorBox];
      },
    });
    const failure = Object.assign(new Error('Script error for "c0ffee_0.0.1/ejs"'), { requireType: 'scripterror', requireModules: ['c0ffee_0.0.1/ejs'] });
    console.error('RequireJS error', failure);
    console.error('Could not load hello-web-part in require.', failure);
    console.error('Could not load hello-web-part in require.', failure);
    console.error('Could not load other-bundle in require.', Object.assign(new Error('x'), { requireType: 'define', requireModules: ['other-bundle'] }));
    await delay(10);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: 'load-error', bundle: 'hello-web-part', requireType: 'scripterror', requireModules: ['c0ffee_0.0.1/ejs'] });
    expect(selectors[0]).toBe('[data-sp-web-part-id="c0ffee00-0000-4000-8000-000000000001"] [data-automation-id="webPartError"]');
    expect(unreadable.textContent).toBe(`ERROR:${pageMessage}`);
  });

  it('shows compile errors from several dev-server clients in one overlay and closes it after the rebuild', () => {
    const { page, overlays } = startPage();
    const errors = { type: 'webpackErrors', data: ['ERROR in ./src/a.tsx\n× Syntax Error'] };
    for (let client = 0; client < 3; client++) devServerMessage(page, errors);
    page.dispatch('message', { data: errors, source: {} });
    expect(overlays()).toHaveLength(1);
    expect(overlayText(overlays()[0])).toContain('[fast-serve] Compile error');
    expect(overlayText(overlays()[0])).toContain('× Syntax Error');
    devServerMessage(page, { type: 'webpackInvalid' });
    expect(overlays()).toHaveLength(0);
    expect(page.reloads()).toBe(0);
  });

  it('shows runtime errors the server sends back, without hiding compile errors', async () => {
    const { page, overlays } = startPage(CONFIG, () => ({ overlay: { title: 'Uncaught runtime error', text: '[Unhandled error] Error: boom' } }));
    page.dispatch('error', { error: Object.assign(new Error('boom'), { stack: `Error: boom\n    at ${DIST}a.js:1:1` }) });
    await delay(10);
    expect(overlayText(overlays()[0])).toContain('[Unhandled error] Error: boom');
    devServerMessage(page, { type: 'webpackErrors', data: ['compile'] });
    page.dispatch('error', { error: Object.assign(new Error('again'), { stack: `Error: again\n    at ${DIST}a.js:1:1` }) });
    await delay(10);
    expect(overlays()).toHaveLength(1);
    expect(overlayText(overlays()[0])).toContain('compile');
    page.dispatch('keydown', { key: 'Escape' });
    expect(overlays()).toHaveLength(0);
  });

  it('closes a runtime error overlay after the next successful rebuild from any dev-server client', async () => {
    const { page, overlays } = startPage(CONFIG, RUNTIME_OVERLAY);
    throwFromBundle(page, 'useState1 is not a function');
    await delay(10);
    expect(overlays()).toHaveLength(1);
    devServerMessage(page, { type: 'webpackOk' });
    devServerMessage(page, { type: 'webpackInvalid' });
    expect(overlays()).toHaveLength(1);
    devServerMessage(page, { type: 'webpackOk' });
    devServerMessage(page, { type: 'webpackOk' });
    expect(overlays()).toHaveLength(0);
    expect(page.reloads()).toBe(0);
  });

  it('closes a runtime error overlay after a rebuild that has only warnings', async () => {
    const { page, overlays } = startPage(CONFIG, RUNTIME_OVERLAY);
    throwFromBundle(page, 'useState1 is not defined');
    await delay(10);
    rebuild(page, 'webpackWarnings', 2);
    expect(overlays()).toHaveLength(0);
  });

  it('keeps a runtime error overlay when the rebuild produced nothing new', async () => {
    const { page, overlays } = startPage(CONFIG, RUNTIME_OVERLAY);
    throwFromBundle(page, 'boom');
    await delay(10);
    rebuild(page, 'webpackStillOk');
    expect(overlays()).toHaveLength(1);
  });

  it('opens the overlay again when the error repeats after the update, without redrawing an identical one', async () => {
    const { page, overlays } = startPage(CONFIG, RUNTIME_OVERLAY);
    throwFromBundle(page, 'boom');
    await delay(10);
    const first = overlays()[0];
    throwFromBundle(page, 'boom');
    await delay(10);
    expect(overlays()[0]).toBe(first);
    rebuild(page, 'webpackOk');
    expect(overlays()).toHaveLength(0);
    throwFromBundle(page, 'boom');
    await delay(10);
    expect(overlays()).toHaveLength(1);
    expect(overlayText(overlays()[0])).toContain('[Unhandled error] Error: boom');
  });

  it('ignores an answer about an error that was raised before the update', async () => {
    const answers: ((response: BrowserErrorResponse) => void)[] = [];
    const { page, overlays } = startPage(CONFIG, () => new Promise<BrowserErrorResponse>((resolve) => {
      answers.push(resolve);
    }));
    throwFromBundle(page, 'old code');
    await delay(10);
    rebuild(page, 'webpackOk');
    expect(answers).toHaveLength(1);
    answers[0]?.({ overlay: { title: 'Uncaught runtime error', text: 'old code' } });
    await delay(10);
    expect(overlays()).toHaveLength(0);
  });

  it('closes a compile error overlay after the fix, also when the fixed build has warnings', () => {
    const { page, overlays } = startPage();
    devServerMessage(page, { type: 'webpackErrors', data: ['compile'] });
    devServerMessage(page, { type: 'webpackWarnings', data: ['warning'] });
    expect(overlays()).toHaveLength(0);
    devServerMessage(page, { type: 'webpackErrors', data: ['compile'] });
    expect(overlays()).toHaveLength(1);
    rebuild(page, 'webpackWarnings');
    expect(overlays()).toHaveLength(0);
  });

  it('shows no overlay when it is turned off', async () => {
    const { page, overlays, sent } = startPage({ ...CONFIG, overlay: false }, () => ({ overlay: { title: 't', text: 'x' } }));
    devServerMessage(page, { type: 'webpackErrors', data: ['compile'] });
    page.dispatch('error', { error: Object.assign(new Error('boom'), { stack: `Error: boom\n    at ${DIST}a.js:1:1` }) });
    await delay(10);
    expect(sent).toHaveLength(1);
    expect(overlays()).toHaveLength(0);
  });

  it('reloads the page after the rebuild that follows a bundle load failure', () => {
    const { page, console } = startPage();
    devServerMessage(page, { type: 'webpackOk' });
    expect(page.reloads()).toBe(0);
    console.error('Could not load hello-web-part in require.', Object.assign(new Error('Module build failed'), { requireType: 'define', requireModules: ['hello-web-part'] }));
    devServerMessage(page, { type: 'webpackOk' });
    expect(page.reloads()).toBe(0);
    devServerMessage(page, { type: 'webpackInvalid' });
    devServerMessage(page, { type: 'webpackOk' });
    expect(page.reloads()).toBe(1);
  });

  it('reloads after a bundle load failure when the fixed build has only warnings, not when errors follow them', async () => {
    const { page, console } = startPage();
    console.error('Could not load hello-web-part in require.', Object.assign(new Error('Module build failed'), { requireType: 'define', requireModules: ['hello-web-part'] }));
    devServerMessage(page, { type: 'webpackInvalid' });
    devServerMessage(page, { type: 'webpackWarnings', data: ['warning'] });
    devServerMessage(page, { type: 'webpackErrors', data: ['still broken'] });
    await delay(150);
    expect(page.reloads()).toBe(0);
    rebuild(page, 'webpackWarnings');
    await delay(150);
    expect(page.reloads()).toBe(1);
  });

  describe('type errors', () => {
    it('show in the error overlay while the type check has issues and close when it is clean', () => {
      const { types, overlays, source } = startTypePage();
      expect(types.url).toBe(TYPE_EVENTS_URL);
      types.send(null);
      expect(overlays()).toEqual([]);
      types.send(ONE_TYPE_ERROR);
      expect(overlays()).toHaveLength(1);
      expect(source()).toBe('type');
      expect(overlayText(overlays()[0])).toContain('[fast-serve] Type check: 1 error');
      expect(overlayText(overlays()[0])).toContain("TS2304: Cannot find name 'x'.");
      const shown = overlays()[0];
      types.send(ONE_TYPE_ERROR);
      expect(overlays()[0]).toBe(shown);
      types.send(null);
      expect(overlays()).toEqual([]);
    });

    it('open one event stream per page however many copies of the runtime run', () => {
      const { page } = startTypePage();
      page.evaluate(renderPageScript(TYPE_CONFIG));
      expect(FakeEventSource.opened.map((opened) => opened.url)).toEqual([TYPE_EVENTS_URL]);
    });

    it('stay hidden after Esc or × until they change', () => {
      const { page, types, overlays } = startTypePage();
      types.send(ONE_TYPE_ERROR);
      page.dispatch('keydown', { key: 'Escape' });
      expect(overlays()).toEqual([]);
      types.send(ONE_TYPE_ERROR);
      expect(overlays()).toEqual([]);
      types.send(TWO_TYPE_ERRORS);
      expect(overlayText(overlays()[0])).toContain('Type check: 2 errors');
      overlays()[0]?.shadowRoot?.childNodes[0]?.childNodes[0]?.childNodes[0]?.dispatchEvent({ type: 'click' });
      expect(overlays()).toEqual([]);
      types.send(null);
      types.send(TWO_TYPE_ERRORS);
      expect(overlays()).toHaveLength(1);
    });

    it('give way to compile errors, listed as "Also", and come back after the fix', () => {
      const { page, types, overlays, source } = startTypePage();
      types.send(ONE_TYPE_ERROR);
      devServerMessage(page, { type: 'webpackErrors', data: ["src/c.tsx\n× Expected '}', got '<eof>'"] });
      expect(overlays()).toHaveLength(1);
      expect(source()).toBe('compile');
      expect(overlayText(overlays()[0])).toContain("× Expected '}'");
      expect(overlayText(overlays()[0])).toContain('Also: Type check: 1 error');
      expect(overlayText(overlays()[0])).not.toContain('TS2304');
      rebuild(page, 'webpackOk');
      expect(source()).toBe('type');
      expect(overlayText(overlays()[0])).toContain('TS2304');
    });

    it('give way to runtime errors and come back when the next update closes them', async () => {
      const { page, types, overlays, source } = startTypePage(TYPE_CONFIG, RUNTIME_OVERLAY);
      types.send(ONE_TYPE_ERROR);
      throwFromBundle(page, 'escape1 is not defined');
      await delay(10);
      expect(source()).toBe('runtime');
      expect(overlayText(overlays()[0])).toContain('Also: Type check: 1 error');
      rebuild(page, 'webpackOk');
      expect(source()).toBe('type');
    });

    it('rank compile errors over runtime errors over type errors', async () => {
      const { page, types, overlays, source } = startTypePage(TYPE_CONFIG, RUNTIME_OVERLAY);
      types.send(ONE_TYPE_ERROR);
      throwFromBundle(page, 'escape1 is not defined');
      await delay(10);
      devServerMessage(page, { type: 'webpackErrors', data: ['syntax error'] });
      expect(overlays()).toHaveLength(1);
      expect(source()).toBe('compile');
      expect(overlayText(overlays()[0])).toContain('Also: Uncaught runtime error\nAlso: Type check: 1 error');
    });

    it('close with everything else on Esc and return only when they change', async () => {
      const { page, types, overlays, source } = startTypePage(TYPE_CONFIG, RUNTIME_OVERLAY);
      types.send(ONE_TYPE_ERROR);
      throwFromBundle(page, 'escape1 is not defined');
      await delay(10);
      expect(source()).toBe('runtime');
      page.dispatch('keydown', { key: 'Escape' });
      expect(overlays()).toEqual([]);
      types.send(TWO_TYPE_ERRORS);
      expect(source()).toBe('type');
    });

    it('stay out of the page when the overlay is off or the type check has no event stream', () => {
      FakeEventSource.opened.length = 0;
      startPage({ ...TYPE_CONFIG, overlay: false }, () => ({}), { EventSource: FakeEventSource });
      startPage(CONFIG, () => ({}), { EventSource: FakeEventSource });
      expect(FakeEventSource.opened).toEqual([]);
    });
  });
});
