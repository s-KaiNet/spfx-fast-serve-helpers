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
    const root = projectWith('{ "$schema": "x", // comment\n "port": 4500, "pageUrl": "https://x/y", "locale": "nl-nl", }');
    expect(loadOptionsFile(root)).toEqual({ port: 4500, pageUrl: 'https://x/y', locale: 'nl-nl' });
  });

  it('rejects unknown options and wrong types', () => {
    expect(() => loadOptionsFile(projectWith('{ "open": true }'))).toThrow(/unknown option.*"open"/);
    expect(() => loadOptionsFile(projectWith('{ "port": "4321" }'))).toThrow(/"port"/);
  });
});
