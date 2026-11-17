import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadOptionsFile, parsePort, resolveOptions } from './options.js';

describe('resolveOptions', () => {
  it('uses built-in defaults with zero config', () => {
    expect(resolveOptions({}, {})).toEqual({
      port: 4321,
      origin: 'https://localhost:4321',
      locale: 'en-us',
      pageUrl: undefined,
      pageUrlTemplate: undefined,
      serveConfiguration: undefined,
      replacedServeConfigurationPage: undefined,
    });
  });

  it('prefers CLI over the options file over project defaults', () => {
    const defaults = { port: 4000, initialPage: 'https://a.sharepoint.com/default' };
    const file = { port: 4100, pageUrl: 'https://a.sharepoint.com/file', locale: 'de-de' };
    expect(resolveOptions({ defaults }, {})).toMatchObject({ port: 4000, pageUrl: defaults.initialPage, locale: 'en-us' });
    expect(resolveOptions({ defaults, file }, {})).toMatchObject({ port: 4100, pageUrl: file.pageUrl, locale: 'de-de' });
    expect(resolveOptions({ defaults, file, cli: { port: 4200, locale: 'FR-FR' } }, {})).toMatchObject({
      port: 4200,
      origin: 'https://localhost:4200',
      pageUrl: file.pageUrl,
      locale: 'fr-fr',
    });
  });

  it('substitutes {tenantDomain} from SPFX_SERVE_TENANT_DOMAIN', () => {
    const defaults = { initialPage: 'https://{tenantDomain}/_layouts/workbench.aspx' };
    expect(resolveOptions({ defaults }, { SPFX_SERVE_TENANT_DOMAIN: 'https://contoso.sharepoint.com/' })).toMatchObject({
      pageUrl: 'https://contoso.sharepoint.com/_layouts/workbench.aspx',
    });
    expect(resolveOptions({ defaults }, {})).toMatchObject({ pageUrl: undefined, pageUrlTemplate: defaults.initialPage });
  });

  describe('serve configurations', () => {
    const serveConfigurations = {
      default: { pageUrl: 'https://{tenantDomain}/SitePages/home.aspx', customActions: { a: { location: 'ClientSideExtension.ApplicationCustomizer' } } },
      rating: { pageUrl: 'https://t/Lists/L/AllItems.aspx', fieldCustomizers: { Title: { id: 'r' } } },
      noPage: { customActions: { c: { location: 'ClientSideExtension.ListViewCommandSet.CommandBar' } } },
    };
    const defaults = { initialPage: 'https://t/_layouts/workbench.aspx', serveConfigurations };
    const env = { SPFX_SERVE_TENANT_DOMAIN: 'contoso.sharepoint.com' };

    it('uses "default" like heft, with its page instead of initialPage', () => {
      expect(resolveOptions({ defaults }, env)).toMatchObject({
        pageUrl: 'https://contoso.sharepoint.com/SitePages/home.aspx',
        pageUrlTemplate: serveConfigurations.default.pageUrl,
        serveConfiguration: { name: 'default', ...serveConfigurations.default },
      });
    });

    it('selects a configuration from the CLI or the options file', () => {
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'rating' } }, env)).toMatchObject({
        pageUrl: 'https://t/Lists/L/AllItems.aspx',
        serveConfiguration: { name: 'rating', fieldCustomizers: { Title: { id: 'r' } } },
      });
      expect(resolveOptions({ defaults, file: { serveConfiguration: 'rating' }, cli: { serveConfiguration: 'noPage' } }, env)).toMatchObject({
        serveConfiguration: { name: 'noPage' },
      });
      expect(resolveOptions({ defaults, file: { serveConfiguration: 'rating' } }, env).serveConfiguration?.name).toBe('rating');
    });

    it('falls back to the default page for a configuration without one', () => {
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'noPage' } }, env).pageUrl).toBe('https://contoso.sharepoint.com/SitePages/home.aspx');
    });

    it('lets a pageUrl option replace the page of the configuration', () => {
      const options = resolveOptions({ defaults, file: { pageUrl: 'https://t/file.aspx' }, cli: { serveConfiguration: 'rating' } }, env);
      expect(options).toMatchObject({
        pageUrl: 'https://t/file.aspx',
        serveConfiguration: { name: 'rating' },
        replacedServeConfigurationPage: 'https://t/Lists/L/AllItems.aspx',
      });
      expect(
        resolveOptions({ defaults, file: { pageUrl: 'https://contoso.sharepoint.com/SitePages/home.aspx' } }, env).replacedServeConfigurationPage,
      ).toBeUndefined();
      expect(resolveOptions({ defaults, cli: { pageUrl: 'https://t/cli.aspx' } }, env).pageUrl).toBe('https://t/cli.aspx');
    });

    it('has no configuration without "default" unless one is selected', () => {
      const withoutDefault = { initialPage: defaults.initialPage, serveConfigurations: { rating: serveConfigurations.rating } };
      expect(resolveOptions({ defaults: withoutDefault }, env)).toMatchObject({ pageUrl: defaults.initialPage, serveConfiguration: undefined });
    });

    it('rejects an unknown configuration name', () => {
      expect(() => resolveOptions({ defaults, cli: { serveConfiguration: 'nope' } }, env)).toThrow(
        'Serve configuration "nope" not found in config/serve.json "serveConfigurations" (available: default, rating, noPage)',
      );
      expect(() => resolveOptions({ cli: { serveConfiguration: 'nope' } }, env)).toThrow(/\(the file has none\)/);
    });
  });

  it('rejects invalid ports and locales', () => {
    expect(() => resolveOptions({ cli: { port: 70000 } }, {})).toThrow(/Invalid port/);
    expect(() => resolveOptions({ cli: { locale: 'en us' } }, {})).toThrow(/Invalid locale/);
    expect(() => parsePort('abc')).toThrow(/Invalid port/);
    expect(parsePort('4321')).toBe(4321);
  });
});

function projectWith(content?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-options-'));
  mkdirSync(path.join(root, 'config'));
  if (content !== undefined) writeFileSync(path.join(root, 'config', 'fast-serve.json'), content);
  return root;
}

describe('loadOptionsFile', () => {
  it('returns no options when the file is missing', () => {
    expect(loadOptionsFile(projectWith())).toEqual({});
  });

  it('reads JSON with comments', () => {
    const root = projectWith('{ "$schema": "x", // comment\n "port": 4500, "pageUrl": "https://x/y", "locale": "nl-nl", "serveConfiguration": "rating", }');
    expect(loadOptionsFile(root)).toEqual({ port: 4500, pageUrl: 'https://x/y', locale: 'nl-nl', serveConfiguration: 'rating' });
  });

  it('rejects unknown options and wrong types', () => {
    expect(() => loadOptionsFile(projectWith('{ "open": true }'))).toThrow(/unknown option.*"open"/);
    expect(() => loadOptionsFile(projectWith('{ "port": "4321" }'))).toThrow(/"port"/);
  });
});
