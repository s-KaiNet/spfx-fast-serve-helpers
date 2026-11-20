import { describe, expect, it } from 'vitest';
import { resolveOptions, withTunnelHost } from '../config/options.js';
import type { SpfxComponent } from '../project/index.js';
import { readyBanner } from './readyBanner.js';

const components: SpfxComponent[] = [
  { bundleName: 'b', manifestFile: '/p/a.json', entryFile: '/p/a.ts', manifest: { id: 'a', alias: 'HelloWebPart', componentType: 'WebPart', version: '1.0.0' } },
  {
    bundleName: 'b',
    manifestFile: '/p/b.json',
    entryFile: '/p/b.ts',
    manifest: { id: 'b', alias: 'BannerApplicationCustomizer', componentType: 'Extension', extensionType: 'ApplicationCustomizer', version: '1.0.0' },
  },
];

describe('readyBanner', () => {
  it('prints the components and the page with the debug query on the chosen port', () => {
    const options = resolveOptions({ cli: { port: 4433, pageUrl: 'https://contoso.sharepoint.com/SitePages/Home.aspx?a=1' } }, {});
    expect(readyBanner(options, components, 812)).toEqual([
      'ready in 812 ms at https://localhost:4433',
      'web parts: HelloWebPart',
      'extensions: BannerApplicationCustomizer (ApplicationCustomizer)',
      'open: https://contoso.sharepoint.com/SitePages/Home.aspx?debugManifestsFile=https%3A%2F%2Flocalhost%3A4433%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true',
      'the debug query sticks to the browser tab: after stopping fast-serve, open the page in a new tab',
    ]);
  });

  it('prints the debug query and the missing tenant variable without a page URL', () => {
    const options = resolveOptions({ defaults: { port: 4321, initialPage: 'https://{tenantDomain}/sites/dev/SitePages/Test.aspx' } }, {});
    const lines = readyBanner(options, components.slice(0, 1), 5);
    expect(lines).toContain('set SPFX_SERVE_TENANT_DOMAIN to resolve the page URL "https://{tenantDomain}/sites/dev/SitePages/Test.aspx"');
    expect(lines).toContain('append to your SharePoint page URL: ?debugManifestsFile=https%3A%2F%2Flocalhost%3A4321%2Ftemp%2Fbuild%2Fmanifests.js&debug=true&noredir=true');
  });

  it('prints the tunnel origin and the page without a debug query in tunnel mode', () => {
    const options = withTunnelHost(resolveOptions({ cli: { port: 4433, pageUrl: 'https://contoso.sharepoint.com/SitePages/Home.aspx' } }, {}), 'dev.contoso.example');
    const lines = readyBanner(options, components, 900);
    expect(lines[0]).toBe('ready in 900 ms at https://dev.contoso.example (tunnel mode; your tunnel forwards to https://localhost:4433)');
    expect(lines).toContain('open: https://contoso.sharepoint.com/SitePages/Home.aspx');
    expect(lines.join('\n')).toContain('"hostname": "dev.contoso.example", "port": 443');
    expect(lines.join('\n')).not.toContain('debugManifestsFile');
  });
});
