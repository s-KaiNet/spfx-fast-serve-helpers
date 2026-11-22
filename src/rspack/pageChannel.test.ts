import { describe, expect, it } from 'vitest';
import { createPageChannel, type PageServer } from './pageChannel.js';

function fakeServer(events: string[]): PageServer {
  return {
    firstCompile: Promise.resolve(),
    reloadPages: () => events.push('reload'),
    onStop: () => undefined,
  };
}

describe('createPageChannel', () => {
  it('ignores page reloads until the dev server starts and forwards them afterwards', () => {
    const events: string[] = [];
    const page = createPageChannel();
    page.reloadPages();
    page.serverStarted(fakeServer(events));
    page.reloadPages();
    expect(events).toEqual(['reload']);
  });

  it('runs server-started hooks in registration order once the server starts', () => {
    const events: string[] = [];
    const page = createPageChannel();
    page.onServerStarted(() => events.push('first'));
    page.onServerStarted(() => events.push('second'));
    expect(events).toEqual([]);
    page.serverStarted(fakeServer(events));
    expect(events).toEqual(['first', 'second']);
  });

  it('renders the page scripts at request time in registration order', () => {
    const page = createPageChannel();
    let version = 1;
    expect(page.pageScripts()).toBe('');
    page.addPageScript(() => `a${version};`);
    page.addPageScript(() => 'b;');
    version = 2;
    expect(page.pageScripts()).toBe('a2;b;');
  });

  it('forwards typings updates to the listeners registered so far', () => {
    const page = createPageChannel();
    const received: unknown[] = [];
    page.typingsUpdated({ written: ['/p/temp/sass-ts/early.d.ts'], removed: [] });
    page.onTypingsUpdated((update) => received.push(['first', update]));
    page.onTypingsUpdated((update) => received.push(['second', update]));
    page.typingsUpdated({ written: ['/p/temp/sass-ts/a.d.ts'], removed: ['/p/temp/sass-ts/b.d.ts'] });
    const update = { written: ['/p/temp/sass-ts/a.d.ts'], removed: ['/p/temp/sass-ts/b.d.ts'] };
    expect(received).toEqual([
      ['first', update],
      ['second', update],
    ]);
  });
});
