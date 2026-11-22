import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { renderPageScript } from '../browserErrors/pageScript.js';
import { createFakePage, type FakeNode, type FakePage } from '../../../../test/kit/fakePage.js';
import type { TypeCheckResult } from './issues.js';
import { overlayContent, renderTypeCheckOverlayScript } from './overlay.js';
import { otherCheckerName } from './plugin.js';

const ORIGIN = 'https://localhost:4482';

class FakeEventSource {
  static readonly opened: FakeEventSource[] = [];
  readonly listeners: ((event: { data: unknown }) => void)[] = [];

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

const failing: TypeCheckResult = { errors: 1, warnings: 0, summary: 'type check: 1 error', blocks: ['type error in src/a.ts:1:1\nTS2304: Cannot find name x.'] };
const clean: TypeCheckResult = { errors: 0, warnings: 0, summary: 'type check: no errors', blocks: [] };

const RUNTIME_ERROR = { title: 'Uncaught runtime error', text: "[Unhandled error] ReferenceError: escape1 is not defined" };

function startPage({ withErrorOverlay = false, microtasksBetweenListeners = false } = {}) {
  const page = createFakePage({
    externals: {},
    fetch: () => Promise.resolve(new Response(JSON.stringify({ overlay: RUNTIME_ERROR }))),
  });
  page.globals.EventSource = FakeEventSource;
  if (microtasksBetweenListeners) page.globals.queueMicrotask = (task: () => void) => {
    task();
  };
  FakeEventSource.opened.length = 0;
  if (withErrorOverlay) page.evaluate(renderPageScript({ origin: ORIGIN, distUrl: `${ORIGIN}/dist/`, reportUrl: `${ORIGIN}/fast-serve/browser-errors`, overlay: true, bundles: {} }));
  page.evaluate(renderTypeCheckOverlayScript(ORIGIN));
  const panels = () => page.body.childNodes.filter((node: FakeNode) => node.id === 'fast-serve-type-check-overlay');
  const errorOverlays = () => page.body.childNodes.filter((node: FakeNode) => node.id === 'fast-serve-error-overlay');
  const panelMode = () => panels().map((panel) => panel.getAttribute('data-mode'));
  return { page, panels, errorOverlays, panelMode, events: () => FakeEventSource.opened };
}

function devServerMessage(page: FakePage, data: unknown): void {
  page.dispatch('message', { data, source: page.window });
}

async function settle(): Promise<void> {
  await delay(0);
}

async function throwRuntimeError(page: FakePage): Promise<void> {
  page.dispatch('error', { error: Object.assign(new Error('escape1 is not defined'), { name: 'ReferenceError', stack: `ReferenceError: escape1 is not defined\n    at Hello (${ORIGIN}/dist/hello-web-part.js:9:5)` }) });
  await delay(5);
}

function clickBar(panel: FakeNode | undefined): void {
  panel?.shadowRoot?.childNodes[0]?.dispatchEvent({ type: 'click' });
}

describe('type check overlay', () => {
  it('sends overlay content only while there are issues', () => {
    expect(overlayContent(failing)).toEqual({ title: 'Type check: 1 error', text: failing.blocks[0] });
    expect(overlayContent(clean)).toBeUndefined();
  });

  it('opens one event stream per page and shows the panel until the check is clean', () => {
    const { page, panels, events } = startPage();
    page.evaluate(renderTypeCheckOverlayScript(ORIGIN));
    expect(events().map((source) => source.url)).toEqual([`${ORIGIN}/fast-serve/type-check`]);
    const [source] = events();
    source?.send(null);
    expect(panels()).toEqual([]);
    source?.send(overlayContent(failing));
    expect(panels()).toHaveLength(1);
    expect(panels()[0]?.shadowRoot?.text).toContain('[fast-serve] Type check: 1 error');
    expect(panels()[0]?.shadowRoot?.text).toContain('TS2304: Cannot find name x.');
    source?.send(overlayContent(failing));
    expect(panels()).toHaveLength(1);
    source?.send(null);
    expect(panels()).toEqual([]);
  });

  it('stays hidden after Esc until the errors change', () => {
    const { page, panels, events } = startPage();
    const [source] = events();
    source?.send(overlayContent(failing));
    page.dispatch('keydown', { key: 'Escape' });
    expect(panels()).toEqual([]);
    source?.send(overlayContent(failing));
    expect(panels()).toEqual([]);
    source?.send(overlayContent({ ...failing, errors: 2, summary: 'type check: 2 errors' }));
    expect(panels()).toHaveLength(1);
  });

  it('collapses to a one-line bar while the compile error overlay is open and comes back when it closes', async () => {
    const { page, panelMode, panels, errorOverlays, events } = startPage({ withErrorOverlay: true });
    const [source] = events();
    source?.send(overlayContent(failing));
    expect(panelMode()).toEqual(['full']);
    devServerMessage(page, { type: 'webpackErrors', data: ["src/a.ts\n× Expected '}', got '<eof>'"] });
    expect(errorOverlays()).toHaveLength(1);
    await settle();
    expect(panelMode()).toEqual(['bar']);
    expect(panels()[0]?.shadowRoot?.text).toBe('[fast-serve] Type check: 1 error (also shown in the terminal) - click to show');
    expect(page.body.childNodes.at(-1)?.id).toBe('fast-serve-type-check-overlay');
    devServerMessage(page, { type: 'webpackInvalid' });
    devServerMessage(page, { type: 'webpackOk' });
    expect(errorOverlays()).toEqual([]);
    await settle();
    expect(panelMode()).toEqual(['full']);
    expect(panels()[0]?.shadowRoot?.text).toContain('TS2304: Cannot find name x.');
  });

  it('collapses under the runtime error overlay, expands on click until that overlay changes, and Esc closes only the overlay', async () => {
    const { page, panelMode, errorOverlays, panels, events } = startPage({ withErrorOverlay: true });
    const [source] = events();
    source?.send(overlayContent(failing));
    await throwRuntimeError(page);
    expect(errorOverlays()).toHaveLength(1);
    expect(panelMode()).toEqual(['bar']);
    clickBar(panels()[0]);
    expect(panelMode()).toEqual(['full']);
    source?.send(overlayContent({ ...failing, errors: 2, summary: 'type check: 2 errors' }));
    expect(panelMode()).toEqual(['full']);
    devServerMessage(page, { type: 'webpackErrors', data: ['syntax error'] });
    await settle();
    expect(panelMode()).toEqual(['bar']);
    page.dispatch('keydown', { key: 'Escape' });
    expect(errorOverlays()).toEqual([]);
    await settle();
    expect(panelMode()).toEqual(['full']);
    page.dispatch('keydown', { key: 'Escape' });
    expect(panels()).toEqual([]);
  });

  it('keeps the panel when Esc closes the error overlay although the browser runs microtasks between listeners', async () => {
    const { page, panelMode, errorOverlays, events } = startPage({ withErrorOverlay: true, microtasksBetweenListeners: true });
    const [source] = events();
    source?.send(overlayContent(failing));
    await throwRuntimeError(page);
    expect(panelMode()).toEqual(['bar']);
    page.dispatch('keydown', { key: 'Escape' });
    expect(errorOverlays()).toEqual([]);
    expect(panelMode()).toEqual(['full']);
  });

  it('shows nothing next to an error overlay when the type check is clean', async () => {
    const { page, panels, errorOverlays, events } = startPage({ withErrorOverlay: true });
    const [source] = events();
    source?.send(null);
    await throwRuntimeError(page);
    expect(errorOverlays()).toHaveLength(1);
    expect(panels()).toEqual([]);
    source?.send(overlayContent(failing));
    expect(panels().map((panel) => panel.getAttribute('data-mode'))).toEqual(['bar']);
    source?.send(null);
    expect(panels()).toEqual([]);
  });

  it('recognizes a type checker plugin brought by the extend file', () => {
    class TsCheckerRspackPlugin {
      readonly options = { async: true };
    }
    class ForkTsCheckerWebpackPlugin {
      readonly options = { async: false };
    }
    expect(otherCheckerName([undefined, false, { apply: () => undefined }, new TsCheckerRspackPlugin()])).toBe('TsCheckerRspackPlugin');
    expect(otherCheckerName([new ForkTsCheckerWebpackPlugin()])).toBe('ForkTsCheckerWebpackPlugin');
    expect(otherCheckerName([{ apply: () => undefined }])).toBeUndefined();
  });
});
