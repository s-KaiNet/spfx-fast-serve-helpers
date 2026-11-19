import { describe, expect, it } from 'vitest';
import type { SpfxComponent } from '../project/index.js';
import { aceBannerLines } from './aceBanner.js';
import { hostedWorkbenchUrl, isHostedWorkbench } from './hostedWorkbench.js';

const QUERY = 'debugManifestsFile=x&debug=true&noredir=true';

function component(componentType: string): SpfxComponent {
  return { bundleName: 'b', manifestFile: '/p/m.json', entryFile: '/p/e.ts', manifest: { id: 'i', alias: `My${componentType}`, componentType, version: '1.0.0' } };
}

describe('hostedWorkbenchUrl', () => {
  it.each([
    ['https://contoso.sharepoint.com/sites/dev/SitePages/home.aspx?a=1#x', 'https://contoso.sharepoint.com/sites/dev/_layouts/15/workbench.aspx'],
    ['https://contoso.sharepoint.com/sites/dev/sub/Lists/Tasks/AllItems.aspx', 'https://contoso.sharepoint.com/sites/dev/sub/_layouts/15/workbench.aspx'],
    ['https://contoso.sharepoint.com/sites/dev/Shared%20Documents/Forms/AllItems.aspx', 'https://contoso.sharepoint.com/sites/dev/_layouts/15/workbench.aspx'],
    ['https://contoso.sharepoint.com/teams/hr', 'https://contoso.sharepoint.com/teams/hr/_layouts/15/workbench.aspx'],
    ['https://contoso.sharepoint.com/SitePages/Home.aspx', 'https://contoso.sharepoint.com/_layouts/15/workbench.aspx'],
    ['https://contoso.sharepoint.com/', 'https://contoso.sharepoint.com/_layouts/15/workbench.aspx'],
  ])('maps %s to the site workbench', (pageUrl, expected) => {
    expect(hostedWorkbenchUrl(pageUrl)).toBe(expected);
  });

  it('recognizes workbench URLs and ignores invalid ones', () => {
    expect(isHostedWorkbench('https://contoso.sharepoint.com/_layouts/workbench.aspx')).toBe(true);
    expect(isHostedWorkbench('https://contoso.sharepoint.com/sites/dev/_layouts/15/Workbench.aspx?x=1')).toBe(true);
    expect(isHostedWorkbench('https://contoso.sharepoint.com/sites/dev/SitePages/home.aspx')).toBe(false);
    expect(isHostedWorkbench('not a url')).toBe(false);
    expect(hostedWorkbenchUrl('not a url')).toBeUndefined();
  });
});

describe('aceBannerLines', () => {
  it('prints nothing without Adaptive Card Extensions', () => {
    expect(aceBannerLines([component('WebPart')], 'https://contoso.sharepoint.com/sites/dev/SitePages/home.aspx', QUERY)).toEqual([]);
  });

  it('offers the site workbench with the plain debug query next to a regular page', () => {
    expect(aceBannerLines([component('WebPart'), component('AdaptiveCardExtension')], 'https://contoso.sharepoint.com/sites/dev/SitePages/home.aspx', QUERY)).toEqual([
      'add Adaptive Card Extensions from the toolbox in edit mode; card actions and quick views work in preview/read mode',
      `hosted workbench (keeps an unsaved canvas, retired on 2026-12-01): https://contoso.sharepoint.com/sites/dev/_layouts/15/workbench.aspx?${QUERY}`,
    ]);
  });

  it('only explains the interaction when the page is the workbench or unknown', () => {
    const interaction = ['add Adaptive Card Extensions from the toolbox in edit mode; card actions and quick views work in preview/read mode'];
    expect(aceBannerLines([component('AdaptiveCardExtension')], 'https://contoso.sharepoint.com/_layouts/workbench.aspx', QUERY)).toEqual(interaction);
    expect(aceBannerLines([component('AdaptiveCardExtension')], undefined, QUERY)).toEqual(interaction);
  });
});
