import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import { legacyOptionsFileHint, loadOptionsFile, parsePort, resolveOptions, withTunnelHost } from './options.js';

describe('resolveOptions', () => {
  it('uses built-in defaults with zero config', () => {
    expect(resolveOptions({}, {})).toEqual({
      port: 4321,
      origin: 'https://localhost:4321',
      localOrigin: 'https://localhost:4321',
      tunnelHost: undefined,
      locale: 'en-us',
      pageUrl: undefined,
      pageUrlTemplate: undefined,
      pageUrlProvided: false,
      serveConfiguration: undefined,
      overlay: true,
      typeCheck: true,
      typeCheckOverlay: true,
      lint: true,
      warnings: [],
    });
  });

  it('lints by default; the CLI wins over the options file', () => {
    expect(resolveOptions({ file: { lint: false } }, {}).lint).toBe(false);
    expect(resolveOptions({ file: { lint: 'full' } }, {}).lint).toBe('full');
    expect(resolveOptions({ file: { lint: 'full' }, cli: { lint: false } }, {}).lint).toBe(false);
    expect(resolveOptions({ file: { lint: false }, cli: { lint: true } }, {}).lint).toBe(true);
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

  it('serves under the tunnel origin while listening on the local origin', () => {
    const tunnelled = withTunnelHost(resolveOptions({ cli: { port: 4430 } }, {}), 'dev.contoso.example');
    expect(tunnelled).toMatchObject({ origin: 'https://dev.contoso.example', localOrigin: 'https://localhost:4430', tunnelHost: 'dev.contoso.example', port: 4430 });
    expect(withTunnelHost(tunnelled, undefined)).toMatchObject({ origin: 'https://localhost:4430', tunnelHost: undefined });
  });

  it('turns the error overlay off from the CLI or the options file', () => {
    expect(resolveOptions({ file: { overlay: false } }, {}).overlay).toBe(false);
    expect(resolveOptions({ file: { overlay: true }, cli: { overlay: false } }, {}).overlay).toBe(false);
  });

  it('type checks with the overlay by default; the options file or the CLI turn them off, CLI first', () => {
    expect(resolveOptions({}, {})).toMatchObject({ typeCheck: true, typeCheckOverlay: true, warnings: [] });
    expect(resolveOptions({ file: { typeCheckOverlay: false } }, {})).toMatchObject({ typeCheck: true, typeCheckOverlay: false, warnings: [] });
    expect(resolveOptions({ file: { typeCheck: false } }, {})).toMatchObject({ typeCheck: false, typeCheckOverlay: false, warnings: [] });
    expect(resolveOptions({ file: { typeCheck: true }, cli: { typeCheck: false } }, {})).toMatchObject({ typeCheck: false, typeCheckOverlay: false, warnings: [] });
    expect(resolveOptions({ file: { typeCheck: false, typeCheckOverlay: false }, cli: { typeCheck: true, typeCheckOverlay: true } }, {})).toMatchObject({ typeCheck: true, typeCheckOverlay: true });
    expect(resolveOptions({ file: { typeCheckOverlay: true }, cli: { typeCheckOverlay: false } }, {})).toMatchObject({ typeCheck: true, typeCheckOverlay: false });
  });

  it('keeps the type check overlay off without type checking and says why when it was asked for', () => {
    const resolved = resolveOptions({ cli: { typeCheck: false, typeCheckOverlay: true } }, {});
    expect(resolved).toMatchObject({ typeCheck: false, typeCheckOverlay: false });
    expect(resolved.warnings).toEqual([expect.stringContaining('--no-type-check')]);
  });

  it('substitutes {tenantDomain} from SPFX_SERVE_TENANT_DOMAIN', () => {
    const defaults = { initialPage: 'https://{tenantDomain}/sites/dev/SitePages/Test.aspx' };
    expect(resolveOptions({ defaults }, { SPFX_SERVE_TENANT_DOMAIN: 'https://contoso.sharepoint.com/' })).toMatchObject({
      pageUrl: 'https://contoso.sharepoint.com/sites/dev/SitePages/Test.aspx',
    });
    expect(resolveOptions({ defaults }, {})).toMatchObject({ pageUrl: undefined, pageUrlTemplate: defaults.initialPage });
  });


  describe('serve configurations', () => {
    const serveConfigurations = {
      default: { pageUrl: 'https://{tenantDomain}/SitePages/home.aspx', customActions: { a: { location: 'ClientSideExtension.ApplicationCustomizer' } } },
      rating: { pageUrl: 'https://t/Lists/L/AllItems.aspx', fieldCustomizers: { Title: { id: 'r' } } },
      noPage: { customActions: { c: { location: 'ClientSideExtension.ListViewCommandSet.CommandBar' } } },
    };
    const defaults = { initialPage: 'https://t/SitePages/Test.aspx', serveConfigurations };
    const env = { SPFX_SERVE_TENANT_DOMAIN: 'contoso.sharepoint.com' };

    it('uses "default" like heft, with its page instead of initialPage', () => {
      expect(resolveOptions({ defaults }, env)).toMatchObject({
        pageUrl: 'https://contoso.sharepoint.com/SitePages/home.aspx',
        pageUrlTemplate: serveConfigurations.default.pageUrl,
        serveConfiguration: { name: 'default', ...serveConfigurations.default, explicit: false },
      });
    });

    it('selects a configuration from the CLI or the options file', () => {
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'rating' } }, env)).toMatchObject({
        pageUrl: 'https://t/Lists/L/AllItems.aspx',
        serveConfiguration: { name: 'rating', fieldCustomizers: { Title: { id: 'r' } }, explicit: true },
      });
      expect(resolveOptions({ defaults, file: { serveConfiguration: 'rating' }, cli: { serveConfiguration: 'noPage' } }, env)).toMatchObject({
        serveConfiguration: { name: 'noPage' },
      });
      expect(resolveOptions({ defaults, file: { serveConfiguration: 'rating' } }, env).serveConfiguration).toMatchObject({ name: 'rating', explicit: true });
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'default' } }, env).serveConfiguration).toMatchObject({ name: 'default', explicit: true });
    });

    it('falls back to the default page for a configuration without one', () => {
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'noPage' } }, env).pageUrl).toBe('https://contoso.sharepoint.com/SitePages/home.aspx');
    });

    it('takes a named configuration page first, then the pageUrl option instead of default and initialPage', () => {
      const file = { pageUrl: 'https://t/file.aspx' };
      expect(resolveOptions({ defaults, file, cli: { serveConfiguration: 'rating' } }, env)).toMatchObject({
        pageUrl: 'https://t/Lists/L/AllItems.aspx',
        serveConfiguration: { name: 'rating' },
      });
      expect(resolveOptions({ defaults, file, cli: { serveConfiguration: 'noPage' } }, env).pageUrl).toBe(file.pageUrl);
      expect(resolveOptions({ defaults, file }, env).pageUrl).toBe(file.pageUrl);
      expect(resolveOptions({ defaults, file, cli: { serveConfiguration: 'default' } }, env).pageUrl).toBe(file.pageUrl);
      expect(resolveOptions({ defaults, file, cli: { pageUrl: 'https://t/cli.aspx' } }, env).pageUrl).toBe('https://t/cli.aspx');
      expect(resolveOptions({ defaults: { initialPage: defaults.initialPage }, file }, env).pageUrl).toBe(file.pageUrl);
    });

    it('has no configuration without "default" unless one is selected', () => {
      const withoutDefault = { initialPage: defaults.initialPage, serveConfigurations: { rating: serveConfigurations.rating } };
      expect(resolveOptions({ defaults: withoutDefault }, env)).toMatchObject({ pageUrl: defaults.initialPage, serveConfiguration: undefined });
    });

    it('warns about an unknown configuration name and falls back to "default" like heft', () => {
      expect(resolveOptions({ defaults, cli: { serveConfiguration: 'nope' } }, env)).toMatchObject({
        pageUrl: 'https://contoso.sharepoint.com/SitePages/home.aspx',
        serveConfiguration: { name: 'default', ...serveConfigurations.default, explicit: false },
        warnings: ['serve configuration "nope" not found in config/serve.json "serveConfigurations" (available: default, rating, noPage), using "default"'],
      });
      expect(resolveOptions({ defaults: { initialPage: defaults.initialPage }, cli: { serveConfiguration: 'nope' } }, env)).toMatchObject({
        pageUrl: defaults.initialPage,
        serveConfiguration: undefined,
        warnings: ['serve configuration "nope" not found in config/serve.json "serveConfigurations" (the file has none)'],
      });
    });
  });

  it('rejects invalid ports and locales', () => {
    expect(() => resolveOptions({ cli: { port: 70000 } }, {})).toThrow(/Invalid port/);
    expect(() => resolveOptions({ cli: { locale: 'en us' } }, {})).toThrow(/Invalid locale/);
    expect(() => parsePort('abc')).toThrow('Invalid port "abc" (expected 1-65535)');
    expect(() => parsePort('43.5')).toThrow('Invalid port "43.5"');
    expect(parsePort('4321')).toBe(4321);
  });
});

function projectWith(content?: string): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-options-'));
  mkdirSync(path.join(root, 'fast-serve'));
  if (content !== undefined) writeFileSync(path.join(root, 'fast-serve', 'config.json'), content);
  return root;
}

describe('loadOptionsFile', () => {
  it('returns no options when the file is missing', () => {
    expect(loadOptionsFile(projectWith())).toEqual({});
  });

  it('reads JSON with comments', () => {
    const root = projectWith('{ "$schema": "x", // comment\n "port": 4500, "pageUrl": "https://x/y", "locale": "nl-nl", "serveConfiguration": "rating", "overlay": false, }');
    expect(loadOptionsFile(root)).toEqual({ port: 4500, pageUrl: 'https://x/y', locale: 'nl-nl', serveConfiguration: 'rating', overlay: false });
  });

  it('reads the libraries to load from SharePoint', () => {
    expect(loadOptionsFile(projectWith('{ "deployedLibraries": ["@contoso/corp-lib"] }'))).toEqual({ deployedLibraries: ['@contoso/corp-lib'] });
    expect(() => loadOptionsFile(projectWith('{ "deployedLibraries": "@contoso/corp-lib" }'))).toThrow(/"deployedLibraries"/);
  });

  it('reads the type check switches', () => {
    expect(loadOptionsFile(projectWith('{ "typeCheck": true, "typeCheckOverlay": false }'))).toEqual({ typeCheck: true, typeCheckOverlay: false });
    expect(() => loadOptionsFile(projectWith('{ "typeCheck": "yes" }'))).toThrow(/"typeCheck"/);
    expect(() => loadOptionsFile(projectWith('{ "typeCheckOverlay": 1 }'))).toThrow(/"typeCheckOverlay"/);
  });

  it('reads the lint setting', () => {
    expect(loadOptionsFile(projectWith('{ "lint": false }'))).toEqual({ lint: false });
    expect(loadOptionsFile(projectWith('{ "lint": "full" }'))).toEqual({ lint: 'full' });
    expect(() => loadOptionsFile(projectWith('{ "lint": "fast" }'))).toThrow(/"lint"/);
    expect(() => loadOptionsFile(projectWith('{ "lint": 1 }'))).toThrow(/"lint"/);
  });

  it('rejects unknown options and wrong types', () => {
    expect(() => loadOptionsFile(projectWith('{ "open": true }'))).toThrow(/unknown option.*"open"/);
    expect(() => loadOptionsFile(projectWith('{ "port": "4321" }'))).toThrow(/"port"/);
    expect(() => loadOptionsFile(projectWith('{ "overlay": "no" }'))).toThrow(/"overlay"/);
  });

  it('stops on the outdated classic format with its nested serve object', () => {
    const classic = '{ "$schema": "https://raw.githubusercontent.com/s-KaiNet/spfx-fast-serve/master/schema/config.v2.schema.json", ' +
      '"serve": { "port": 4500, "openUrl": "https://contoso.sharepoint.com/sites/dev", "memory": 8192 } }';
    expect(() => loadOptionsFile(projectWith(classic))).toThrow(
      'fast-serve/config.json uses the outdated classic spfx-fast-serve format (options nested in "serve"), which is no longer supported. ' +
        'Replace it with the flat format: "$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json" and the supported options ' +
        '(port, pageUrl, locale, serveConfiguration, overlay, deployedLibraries, typeCheck, typeCheckOverlay, lint).',
    );
  });

  it('names the schema when it rejects a key', () => {
    expect(() => loadOptionsFile(projectWith('{ "serve": true }'))).toThrow(
      'fast-serve/config.json: unknown option or wrong type "serve" (supported: port, pageUrl, locale, serveConfiguration, overlay, deployedLibraries, typeCheck, typeCheckOverlay, lint; ' +
        'schema: "$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json")',
    );
  });

  it('ignores options of the Vite version that are not needed, with a warning', () => {
    const warnings: string[] = [];
    expect(loadOptionsFile(projectWith('{ "port": 4500, "amdPackages": ["lodash"] }'), (message) => warnings.push(message))).toEqual({ port: 4500 });
    expect(warnings).toEqual(['fast-serve/config.json: "amdPackages" is ignored (not needed: AMD and UMD code in dependencies is bundled like in heft)']);
  });
});

function projectWithFiles(files: string[]): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-legacy-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), '{ "port": 4500 }');
  }
  return root;
}

describe('legacyOptionsFileHint', () => {
  it('asks to move config/fast-serve.json without reading it', () => {
    const root = projectWithFiles(['config/fast-serve.json']);
    expect(legacyOptionsFileHint(root)).toBe('config/fast-serve.json is not read anymore: move it to fast-serve/config.json (same options)');
    expect(loadOptionsFile(root)).toEqual({});
  });

  it('stays silent when fast-serve/config.json exists or there is no old file', () => {
    expect(legacyOptionsFileHint(projectWithFiles(['config/fast-serve.json', 'fast-serve/config.json']))).toBeUndefined();
    expect(legacyOptionsFileHint(projectWithFiles([]))).toBeUndefined();
  });
});
