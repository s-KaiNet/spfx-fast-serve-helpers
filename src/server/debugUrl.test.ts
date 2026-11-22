import { describe, expect, it } from 'vitest';
import { debugPageUrl, debugQuery, loadsExtensions, readableDebugQuery } from './debugUrl.js';

const origin = 'https://localhost:4321';
const manifests = 'debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js';
const query = `${manifests}&debug=true&noredir=true`;

describe('debug URL', () => {
  it('builds the debug query', () => {
    expect(debugQuery(origin)).toBe(query);
    expect(debugQuery(origin, { pageUrl: 'https://t/a.aspx' })).toBe(query);
  });

  it('appends to page URLs with or without a query and hash', () => {
    expect(debugPageUrl('https://t.sharepoint.com/SitePages/a.aspx', origin)).toBe(`https://t.sharepoint.com/SitePages/a.aspx?${query}`);
    expect(debugPageUrl('https://t/a.aspx?x=1#top', origin)).toBe(`https://t/a.aspx?${query}#top`);
  });

  it('adds loadSPFX and customActions without debug=true, like heft', () => {
    const customActions = { 'f1e9c965-12f5-4beb-9103-7640ed381a72': { location: 'ClientSideExtension.ApplicationCustomizer', properties: { testMessage: 'Test message' } } };
    const params = new URLSearchParams(debugQuery(origin, { customActions }));
    expect([...params.keys()]).toEqual(['debugManifestsFile', 'noredir', 'loadSPFX', 'customActions']);
    expect(params.get('loadSPFX')).toBe('true');
    expect(JSON.parse(params.get('customActions') ?? '')).toEqual(customActions);
    expect(debugQuery(origin, { customActions })).toBe(
      `${manifests}&noredir=true&loadSPFX=true&customActions=%7B%22f1e9c965-12f5-4beb-9103-7640ed381a72%22%3A%7B%22location%22%3A%22ClientSideExtension.ApplicationCustomizer%22%2C%22properties%22%3A%7B%22testMessage%22%3A%22Test+message%22%7D%7D%7D`,
    );
  });

  it('adds fieldCustomizers', () => {
    const fieldCustomizers = { Title: { id: '21fe7eba-88c8-4a4b-ad68-52b7d32f1607', properties: { sampleText: 'Value' } } };
    const params = new URLSearchParams(debugQuery(origin, { fieldCustomizers }));
    expect([...params.keys()]).toEqual(['debugManifestsFile', 'noredir', 'loadSPFX', 'fieldCustomizers']);
    expect(JSON.parse(params.get('fieldCustomizers') ?? '')).toEqual(fieldCustomizers);
  });

  it('adds form customizer parameters: properties as JSON, RootFolder decoded, falsy values skipped', () => {
    const formCustomizer = {
      componentId: '29b61138-a710-4379-b616-98f496c16e4f',
      PageType: 6,
      RootFolder: '/sites/dev/Lists/My%20List',
      ID: 1,
      ContentTypeID: '',
      properties: { sampleText: 'Value' },
    };
    const params = new URLSearchParams(debugQuery(origin, { formCustomizer }));
    expect(Object.fromEntries(params)).toEqual({
      debugManifestsFile: `${origin}/temp/build/manifests.js`,
      noredir: 'true',
      loadSPFX: 'true',
      componentId: formCustomizer.componentId,
      PageType: '6',
      RootFolder: '/sites/dev/Lists/My List',
      ID: '1',
      properties: '{"sampleText":"Value"}',
    });
  });

  it('builds the full page URL of a list configuration', () => {
    const url = new URL(debugPageUrl('https://t/sites/dev/Shared%20Documents/Forms/AllItems.aspx', origin, { fieldCustomizers: { Title: { id: 'r' } } }));
    expect(url.pathname).toBe('/sites/dev/Shared%20Documents/Forms/AllItems.aspx');
    expect(url.searchParams.get('fieldCustomizers')).toBe('{"Title":{"id":"r"}}');
    expect(url.searchParams.has('debug')).toBe(false);
  });

  it('builds a readable query that keeps only whitespace, %, &, # and + encoded and parses to the same parameters', () => {
    expect(readableDebugQuery(origin)).toBe(`debugManifestsFile=${origin}/temp/build/manifests.js&debug=true&noredir=true`);
    const formCustomizer = { componentId: 'c', PageType: 8, RootFolder: '/sites/dev/Lists/My%20List', properties: { text: 'a&b #1 + 50% {x}' } };
    const readable = readableDebugQuery(origin, { formCustomizer });
    expect(readable).toBe(
      `debugManifestsFile=${origin}/temp/build/manifests.js&noredir=true&loadSPFX=true&componentId=c&PageType=8&RootFolder=/sites/dev/Lists/My%20List&properties={"text":"a%26b%20%231%20%2B%2050%25%20{x}"}`,
    );
    expect(Object.fromEntries(new URLSearchParams(readable))).toEqual(Object.fromEntries(new URLSearchParams(debugQuery(origin, { formCustomizer }))));
  });

  it('tells whether a serve configuration loads extensions', () => {
    expect(loadsExtensions({})).toBe(false);
    expect(loadsExtensions({ pageUrl: 'https://t/a.aspx' })).toBe(false);
    expect(loadsExtensions({ customActions: {} })).toBe(true);
    expect(loadsExtensions({ fieldCustomizers: { Title: { id: 'r' } } })).toBe(true);
    expect(loadsExtensions({ formCustomizer: { componentId: 'c' } })).toBe(true);
  });
});
