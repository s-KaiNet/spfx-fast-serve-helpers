import { describe, expect, it } from 'vitest';
import type { SpfxComponent } from '../project/index.js';
import { ACE_PAGE_HINT, aceBannerLines } from './aceBanner.js';

const QUERY = 'debugManifestsFile=x&debug=true&noredir=true';

function component(componentType: string): SpfxComponent {
  return { bundleName: 'b', manifestFile: '/p/m.json', entryFile: '/p/e.ts', manifest: { id: 'i', alias: `My${componentType}`, componentType, version: '1.0.0' } };
}

describe('aceBannerLines', () => {
  it('prints nothing without Adaptive Card Extensions', () => {
    expect(aceBannerLines([component('WebPart')], undefined)).toEqual([]);
  });

  it('explains how to add and use Adaptive Card Extensions on a SharePoint page', () => {
    expect(aceBannerLines([component('WebPart'), component('AdaptiveCardExtension')], undefined)).toEqual([ACE_PAGE_HINT]);
  });

  it('adds the web-part debug query when the opened page uses the extension query', () => {
    expect(aceBannerLines([component('AdaptiveCardExtension')], QUERY)).toEqual([
      ACE_PAGE_HINT,
      `to add them, open a SharePoint page with the web-part debug query: ?${QUERY}`,
    ]);
  });
});
