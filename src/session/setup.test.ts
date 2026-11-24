import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, onTestFinished } from 'vitest';
import type { Logger } from '../shared/logger.js';
import { packageVersion } from '../shared/packageInfo.js';
import { copyLibraryFixture, LIBRARY_PACKAGE, linkLocalPackage } from '../../test/kit/compileKit.js';
import { prepareServe, setupDetails, versionLine } from './index.js';
import { fixturePath } from '../../test/kit/paths.js';

const fixture = fixturePath('basic');

function recordingLogger() {
  const messages: string[] = [];
  const logger: Logger = {
    info: (message) => messages.push(`info: ${message}`),
    warn: (message) => messages.push(`warn: ${message}`),
    error: (message) => messages.push(`error: ${message}`),
  };
  return { logger, messages };
}

function fixtureCopy(files: Record<string, string> = {}): string {
  const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-setup-'));
  onTestFinished(() => {
    rmSync(root, { recursive: true, force: true });
  });
  cpSync(fixture, root, { recursive: true });
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  }
  return root;
}

describe('prepareServe', () => {
  it('checks the SPFx version, reads the model and resolves the options', () => {
    const { logger } = recordingLogger();
    const setup = prepareServe({ root: fixture, logger, env: { SPFX_SERVE_TENANT_DOMAIN: 'contoso.sharepoint.com' } });
    expect(setup.root).toBe(fixture);
    expect(setup.spfxVersion).toEqual({ kind: 'installed', version: '1.23.2', packageName: '@microsoft/sp-core-library' });
    expect(setup.options).toMatchObject({ port: 4400, locale: 'en-us', pageUrl: 'https://contoso.sharepoint.com/sites/dev/SitePages/Test.aspx' });
    expect(setup.project.bundles().map((bundle) => bundle.name)).toEqual(['hello-web-part', 'card-adaptive-card-extension', 'tools-library', 'banner-application-customizer']);
  });

  it('lets flags win over fast-serve/config.json and warns about old and dropped options', () => {
    const root = fixtureCopy({
      'fast-serve/config.json': '{ "port": 4500, "locale": "de-de", "amdPackages": [] }',
      'config/fast-serve.json': '{}',
    });
    const { logger, messages } = recordingLogger();
    const setup = prepareServe({ root, cli: { port: 4600, serveConfiguration: 'nope' }, logger, env: {} });
    expect(setup.options).toMatchObject({ port: 4600, locale: 'de-de', pageUrl: undefined });
    expect(messages).toEqual([
      'warn: fast-serve/config.json: "amdPackages" is ignored (not needed: AMD and UMD code in dependencies is bundled like in heft)',
      'warn: serve configuration "nope" not found in config/serve.json "serveConfigurations" (the file has none)',
    ]);
    expect(prepareServe({ root: fixtureCopy({ 'config/fast-serve.json': '{}' }), logger, env: {} }).options.port).toBe(4400);
    expect(messages).toContain('warn: config/fast-serve.json is not read anymore: move it to fast-serve/config.json (same options)');
  });

  it('checks the selected serve configuration against the served extensions', () => {
    const root = fixtureCopy({
      'config/serve.json': JSON.stringify({
        initialPage: 'https://contoso.sharepoint.com/sites/dev/SitePages/home.aspx',
        serveConfigurations: {
          default: { customActions: { '99999999-2222-3333-4444-555555555555': { location: 'ClientSideExtension.ApplicationCustomizer' } } },
          commands: {
            pageUrl: 'https://contoso.sharepoint.com/sites/dev/Lists/Tasks/AllItems.aspx',
            customActions: { '11111111-2222-3333-4444-555555555555': { location: 'ClientSideExtension.ListViewCommandSet.CommandBar' } },
          },
        },
      }),
    });
    const quiet = recordingLogger();
    expect(prepareServe({ root, logger: quiet.logger, env: {} }).options.serveConfiguration?.name).toBe('default');
    expect(quiet.messages.filter((message) => message.includes('serveConfigurations'))).toEqual([]);

    const { logger, messages } = recordingLogger();
    const setup = prepareServe({ root, cli: { serveConfiguration: 'commands' }, logger, env: {} });
    expect(setup.options.pageUrl).toBe('https://contoso.sharepoint.com/sites/dev/Lists/Tasks/AllItems.aspx');
    expect(messages).toContain(
      'warn: config/serve.json serveConfigurations.commands.customActions.11111111-2222-3333-4444-555555555555: HelloWebPart is WebPart, expected ListViewCommandSet',
    );
  });

  it('refuses unsupported SPFx versions and projects without components', () => {
    const { logger } = recordingLogger();
    const newer = fixtureCopy({ 'node_modules/@microsoft/sp-core-library/package.json': '{ "name": "@microsoft/sp-core-library", "version": "1.24.0" }' });
    expect(() => prepareServe({ root: newer, logger })).toThrow(/Unsupported SPFx version: this project uses SPFx 1\.24\.0/);
    const empty = fixtureCopy({ 'config/config.json': '{ "bundles": {} }' });
    expect(() => prepareServe({ root: empty, logger })).toThrow(/No web parts, extensions, Adaptive Card Extensions or library components/);
  });

  it('serves a library-only project: its Library component is a bundle of its own', () => {
    const library = fixtureCopy({
      'config/config.json': JSON.stringify({ bundles: { lib: { components: [{ entrypoint: './lib/index.js', manifest: './src/Lib.manifest.json' }] } } }),
      'src/Lib.manifest.json': JSON.stringify({ id: '5c1d6a0e-1f7b-4a8e-9d43-2b7f0c9e1a11', alias: 'CorpLibLibrary', componentType: 'Library', version: '*' }),
      'src/index.ts': 'export const answer = 42;\n',
    });
    const { logger, messages } = recordingLogger();
    const setup = prepareServe({ root: library, logger, env: {} });
    expect(setup.project.bundles().map(({ name, components }) => ({ name, aliases: components.map(({ manifest }) => manifest.alias) }))).toEqual([
      { name: 'lib', aliases: ['CorpLibLibrary'] },
    ]);
    expect(messages.filter((message) => message.startsWith('warn:'))).toEqual([]);
  });

  it('lists linked libraries compiled from source and checks the deployedLibraries option', () => {
    const library = copyLibraryFixture();
    onTestFinished(() => {
      library.remove();
    });
    const root = fixtureCopy();
    linkLocalPackage(root, LIBRARY_PACKAGE, library.root);
    const { logger, messages } = recordingLogger();
    const lines = setupDetails(prepareServe({ root, logger, env: {} }));
    expect(lines).toContain(`SPFx libraries from source: ${LIBRARY_PACKAGE} (${path.relative(root, library.root).split(path.sep).join('/')})`);
    mkdirSync(path.join(root, 'fast-serve'));
    writeFileSync(path.join(root, 'fast-serve', 'config.json'), JSON.stringify({ deployedLibraries: [LIBRARY_PACKAGE, 'missing-lib'] }));
    const optedOut = prepareServe({ root, logger, env: {} });
    expect(optedOut.project.localLibraries()).toEqual([]);
    expect(optedOut.project.libraries().has(LIBRARY_PACKAGE)).toBe(true);
    expect(messages.filter((message) => message.includes('deployedLibraries'))).toEqual(['warn: fast-serve/config.json: "deployedLibraries" lists "missing-lib", which is not an SPFx library dependency of this project']);
  });
});

describe('versionLine', () => {
  it('names the package and SPFx versions', () => {
    const setup = prepareServe({ root: fixture, logger: recordingLogger().logger, env: {} });
    expect(versionLine(setup)).toBe(`spfx-fast-serve-helpers ${packageVersion}, SPFx 1.23.2`);
  });
});

describe('setupDetails', () => {
  it('summarizes the resolved options and the project model', () => {
    const { logger } = recordingLogger();
    const setup = prepareServe({ root: fixture, cli: { overlay: false }, logger, env: {} });
    expect(setupDetails(setup)).toEqual([
      'port 4400 (https://localhost:4400), locale en-us, overlay off, type check on, lint on',
      'serve configuration: none',
      'page: https://{tenantDomain}/sites/dev/SitePages/Test.aspx (set SPFX_SERVE_TENANT_DOMAIN to fill in {tenantDomain})',
      'bundle hello-web-part: HelloWebPart (WebPart)',
      'bundle card-adaptive-card-extension: CardAdaptiveCardExtension (AdaptiveCardExtension)',
      'bundle tools-library: ToolsLibrary (Library)',
      'bundle banner-application-customizer: BannerApplicationCustomizer (ApplicationCustomizer)',
      'SPFx libraries: 3, config.json externals: 2, localized resources: 2',
    ]);
  });

  it('says how the type check runs', () => {
    const { logger } = recordingLogger();
    const optionsLine = (cli: { typeCheck?: boolean }) => setupDetails(prepareServe({ root: fixture, cli, logger, env: {} }))[0];
    expect(optionsLine({})).toMatch(/, type check on, lint on$/);
    expect(optionsLine({ typeCheck: false })).toMatch(/, type check off, lint on$/);
  });

  it('says how lint runs', () => {
    const { logger } = recordingLogger();
    const optionsLine = (lint: boolean | 'full') => setupDetails(prepareServe({ root: fixture, cli: { lint }, logger, env: {} }))[0];
    expect(optionsLine('full')).toMatch(/, lint on \(full, with type-aware rules\)$/);
    expect(optionsLine(false)).toMatch(/, lint off$/);
  });

  it('names the export of components in bundles with several components and explains a missing page', () => {
    const root = fixtureCopy({
      'config/serve.json': '{}',
      'config/config.json': JSON.stringify({
        bundles: {
          shared: {
            components: [
              { entrypoint: './lib/webparts/hello/HelloWebPart.js', manifest: './src/webparts/hello/HelloWebPart.manifest.json' },
              { entrypoint: './lib/extensions/banner/BannerApplicationCustomizer.js', manifest: './src/extensions/banner/BannerApplicationCustomizer.manifest.json' },
            ],
          },
        },
      }),
    });
    const lines = setupDetails(prepareServe({ root, logger: recordingLogger().logger, env: {} }));
    expect(lines).toContain('bundle shared: HelloWebPart (WebPart, export a), BannerApplicationCustomizer (ApplicationCustomizer, export b)');
    expect(lines).toContain('page: none (set --page-url, "pageUrl" in fast-serve/config.json or "initialPage" in config/serve.json)');
  });
});
