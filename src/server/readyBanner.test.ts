import { describe, expect, it } from 'vitest';
import { resolveOptions, withTunnelHost } from '../config/options.js';
import { readyBanner } from './readyBanner.js';

const RULE = '═'.repeat(64);
const customActions = { 'f1e9c965-12f5-4beb-9103-7640ed381a72': { location: 'ClientSideExtension.ApplicationCustomizer', properties: { testMessage: 'Test & message' } } };
const defaults = { serveConfigurations: { default: { customActions }, banner: { customActions }, plain: { pageUrl: 'https://contoso.sharepoint.com/SitePages/Home.aspx' } } };

describe('readyBanner', () => {
  it('prints the ready line and the unencoded web-part debug query in a box', () => {
    const options = resolveOptions({ cli: { port: 4433 }, defaults: { initialPage: 'https://contoso.sharepoint.com/SitePages/Home.aspx' } }, {});
    expect(readyBanner(options, 812)).toEqual([
      'ready in 812 ms at https://localhost:4433',
      RULE,
      '  To load your scripts, append this to your SharePoint page URL:',
      '  ?debugManifestsFile=https://localhost:4433/temp/build/manifests.js&debug=true&noredir=true',
      RULE,
    ]);
  });

  it('adds the page with the debug query when the page URL is provided with --page-url or "pageUrl"', () => {
    const page = 'https://contoso.sharepoint.com/SitePages/Home.aspx?a=1#top';
    const expected = [
      'ready in 812 ms at https://localhost:4433',
      RULE,
      '  To load your scripts, append this to your SharePoint page URL:',
      '  ?debugManifestsFile=https://localhost:4433/temp/build/manifests.js&debug=true&noredir=true',
      '  Or open:',
      '  https://contoso.sharepoint.com/SitePages/Home.aspx?debugManifestsFile=https://localhost:4433/temp/build/manifests.js&debug=true&noredir=true#top',
      RULE,
    ];
    expect(readyBanner(resolveOptions({ cli: { port: 4433, pageUrl: page } }, {}), 812)).toEqual(expected);
    expect(readyBanner(resolveOptions({ cli: { port: 4433 }, file: { pageUrl: page } }, {}), 812)).toEqual(expected);
  });

  it('opens the provided page with the extension query of an explicitly selected configuration', () => {
    const lines = readyBanner(resolveOptions({ cli: { serveConfiguration: 'banner', pageUrl: 'https://contoso.sharepoint.com/SitePages/Home.aspx' }, defaults }, {}), 5);
    expect(lines.at(-2)).toMatch(/^ {2}https:\/\/contoso\.sharepoint\.com\/SitePages\/Home\.aspx\?debugManifestsFile=.*&loadSPFX=true&customActions=\{/);
  });

  it('asks for the tenant domain when the provided page URL uses {tenantDomain}', () => {
    const lines = readyBanner(resolveOptions({ cli: { pageUrl: 'https://{tenantDomain}/SitePages/Home.aspx' } }, {}), 5);
    expect(lines.at(-2)).toBe('  Set SPFX_SERVE_TENANT_DOMAIN to fill in the page URL "https://{tenantDomain}/SitePages/Home.aspx".');
  });

  it('keeps the short query for the implicit "default" configuration and for one without extensions', () => {
    const short = '  ?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&debug=true&noredir=true';
    for (const cli of [{}, { serveConfiguration: 'plain' }, { serveConfiguration: 'missing' }]) {
      const lines = readyBanner(resolveOptions({ cli, defaults }, {}), 5);
      expect(lines).toHaveLength(5);
      expect(lines[3]).toBe(short);
    }
  });

  it('adds the extension query of a serve configuration selected with --config, keeping separators encoded', () => {
    const lines = readyBanner(resolveOptions({ cli: { serveConfiguration: 'banner' }, defaults }, {}), 5);
    expect(lines.slice(4)).toEqual([
      '  To load the extensions of serve configuration "banner" too, use this instead:',
      '  ?debugManifestsFile=https://localhost:4321/temp/build/manifests.js&noredir=true&loadSPFX=true&customActions={"f1e9c965-12f5-4beb-9103-7640ed381a72":{"location":"ClientSideExtension.ApplicationCustomizer","properties":{"testMessage":"Test%20%26%20message"}}}',
      RULE,
    ]);
    const query = lines[5]?.trim().slice(1) ?? '';
    expect(JSON.parse(new URLSearchParams(query).get('customActions') ?? '')).toEqual(customActions);
    expect(readyBanner(resolveOptions({ cli: { serveConfiguration: 'default' }, defaults }, {}), 5)).toHaveLength(7);
  });

  it('prints the tunnel origin and one instruction without a debug query in tunnel mode', () => {
    const options = withTunnelHost(resolveOptions({ cli: { port: 4433, serveConfiguration: 'banner' }, defaults }, {}), 'dev.contoso.example');
    expect(readyBanner(options, 900)).toEqual([
      'ready in 900 ms at https://dev.contoso.example (tunnel mode; your tunnel forwards to https://localhost:4433)',
      'tunnel mode: open your SharePoint page without the debug query; the development package in the app catalog loads the bundles from https://dev.contoso.example/dist/',
    ]);
  });
});
