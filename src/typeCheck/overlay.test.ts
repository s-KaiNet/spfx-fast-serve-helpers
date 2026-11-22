import { describe, expect, it } from 'vitest';
import { createFakePage, type FakeNode } from '../testing/fakePage.js';
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

function startPage() {
  const page = createFakePage({ externals: {}, fetch: () => Promise.reject(new Error('no fetch expected')) });
  page.globals.EventSource = FakeEventSource;
  FakeEventSource.opened.length = 0;
  page.evaluate(renderTypeCheckOverlayScript(ORIGIN));
  const panels = () => page.body.childNodes.filter((node: FakeNode) => node.id === 'fast-serve-type-check-overlay');
  return { page, panels, events: () => FakeEventSource.opened };
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
