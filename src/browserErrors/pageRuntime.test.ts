import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { createFakePage, FakeNode, type FakePage } from '../testing/fakePage.js';
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

function startPage(config: PageRuntimeConfig = CONFIG, respond: (report: BrowserErrorReport) => BrowserErrorResponse = () => ({})): RuntimePage {
  const sent: BrowserErrorReport[] = [];
  const page = createFakePage({
    externals: {},
    fetch: (url, init) => {
      if (url !== config.reportUrl || typeof init?.body !== 'string') return Promise.reject(new Error(`unexpected fetch ${url}`));
      const report = JSON.parse(init.body) as BrowserErrorReport;
      sent.push(report);
      return Promise.resolve(new Response(JSON.stringify(respond(report))));
    },
  });
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

describe('fast-serve page runtime', () => {
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
    devServerMessage(page, { type: 'webpackWarnings', data: ['ignored'] });
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
});
