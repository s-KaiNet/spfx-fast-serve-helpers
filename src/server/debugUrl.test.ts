import { describe, expect, it } from 'vitest';
import { debugPageUrl, debugQuery } from './debugUrl.js';

const query = 'debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true';

describe('debug URL', () => {
  it('builds the debug query', () => {
    expect(debugQuery('https://localhost:4321')).toBe(query);
  });

  it('appends to page URLs with or without a query and hash', () => {
    const origin = 'https://localhost:4321';
    expect(debugPageUrl('https://t.sharepoint.com/SitePages/a.aspx', origin)).toBe(`https://t.sharepoint.com/SitePages/a.aspx?${query}`);
    expect(debugPageUrl('https://t/a.aspx?x=1#top', origin)).toBe(`https://t/a.aspx?x=1&${query}#top`);
  });
});
