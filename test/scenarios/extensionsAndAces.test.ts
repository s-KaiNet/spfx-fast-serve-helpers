import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '../../src/shared/logger.js';
import type { DebugManifest } from '../../src/features/build/manifests/index.js';
import { startDevServer, type RunningDevServer } from '../../src/server/index.js';
import { prepareServe } from '../../src/session/index.js';
import { freePort, selfSignedCertificate } from '../kit/devServerKit.js';
import { createFakePage, type FakePage } from '../kit/fakePage.js';
import { fixturePath } from '../kit/paths.js';

const fixture = fixturePath('extensions');
const ACE_BASE_ID = 'eeec822e-c28a-46b4-affc-7058e4c1aa80';
const PROPERTY_PANE_ID = 'f9e737b7-f0df-4597-ba8c-3060f82380db';
const SP_LOADER_ID = '1c6c9123-7aac-41f3-a376-3caea41ed83f';

class FakeBase {
  public readonly base: string = 'fake';
}
function PropertyPaneTextField(): string {
  return 'text field';
}
const externals: Record<string, unknown> = {
  '@microsoft/sp-core-library': {},
  '@microsoft/sp-adaptive-card-extension-base': { BaseAdaptiveCardExtension: FakeBase, BaseAdaptiveCardQuickView: FakeBase, BaseComponentsCardView: FakeBase },
  '@microsoft/sp-property-pane': { PropertyPaneTextField },
  '@microsoft/sp-application-base': { BaseApplicationCustomizer: FakeBase },
  '@microsoft/sp-listview-extensibility': { BaseListViewCommandSet: FakeBase },
};

interface FakeAce {
  cardView: { text: string; icon: string };
  quickView: { template: { body: { text: string }[] } };
  propertyPane?: { field: unknown; label: string };
  loadPropertyPaneResources(): Promise<void>;
}

function evaluateManifests(source: string): DebugManifest[] {
  let manifests: DebugManifest[] | undefined;
  vm.runInNewContext(source, { define: (_dependencies: string[], factory: () => { getManifests(): DebugManifest[] }) => (manifests = factory().getManifests()) });
  if (!manifests) throw new Error('manifests.js did not call define()');
  return manifests;
}

function capturedDependencies(source: string): string[] {
  let dependencies: string[] = [];
  const sandbox: Record<string, unknown> = { define: (names: string[]) => (dependencies = names), setTimeout: () => 0 };
  sandbox.self = sandbox;
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  return dependencies;
}

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

describe('extensions and an Adaptive Card Extension served with a serve configuration', () => {
  let root: string;
  let server: RunningDevServer;
  let origin: string;
  let manifests: DebugManifest[];
  let page: FakePage;
  const fetched: string[] = [];
  const messages: string[] = [];

  const recordingFetch = (url: string): Promise<Response> => {
    fetched.push(url);
    return fetch(url);
  };
  const editFile = (relativePath: string, change: (content: string) => string): void => {
    const file = path.join(root, relativePath);
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  const manifest = (alias: string): DebugManifest => {
    const found = manifests.find((entry) => entry.alias === alias);
    if (!found) throw new Error(`no manifest for ${alias}`);
    return found;
  };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-extensions-'));
    cpSync(fixture, root, { recursive: true });
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const port = await freePort();
    origin = `https://localhost:${port}`;
    const setup = prepareServe({ root, cli: { typeCheck: false, port, serveConfiguration: 'commands' }, logger, env: { SPFX_SERVE_TENANT_DOMAIN: 'contoso.sharepoint.com' } });
    server = await startDevServer({ setup, logger, https: certificate, outputPath: path.join(root, 'out') });
    manifests = evaluateManifests(await (await fetch(`${origin}/temp/build/manifests.js`)).text());
    page = createFakePage({ externals, fetch: recordingFetch });
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('prints the web-part query and, for the explicitly selected configuration, its extension query in the box, unencoded', () => {
    expect(messages.filter((message) => message.startsWith('error:') || message.startsWith('warn:'))).toEqual([]);
    const customActions = JSON.stringify({ '20000000-0000-0000-0000-000000000002': { location: 'ClientSideExtension.ListViewCommandSet.CommandBar', properties: { sampleText: 'One' } } });
    const rule = `info: ${'═'.repeat(64)}`;
    const box = messages.slice(messages.indexOf(rule));
    expect(box).toEqual([
      rule,
      'info:   To load your scripts, append this to your SharePoint page URL:',
      `info:   ?debugManifestsFile=${origin}/temp/build/manifests.js&debug=true&noredir=true`,
      'info:   To load the extensions of serve configuration "commands" too, use this instead:',
      `info:   ?debugManifestsFile=${origin}/temp/build/manifests.js&noredir=true&loadSPFX=true&customActions=${customActions}`,
      rule,
    ]);
    expect(messages.join('\n')).not.toMatch(/open: |Adaptive Card Extensions|serve configuration: /);
  });

  it('warns about serve configuration entries that do not match a served extension', () => {
    const warnings: string[] = [];
    const logger: Logger = { info: () => undefined, warn: (message) => warnings.push(message), error: () => undefined };
    prepareServe({ root, cli: { serveConfiguration: 'wrong' }, logger, env: {} });
    expect(warnings).toEqual([
      'config/serve.json serveConfigurations.wrong.customActions.30000000-0000-0000-0000-000000000009: "30000000-0000-0000-0000-000000000009" is not a component fast-serve serves (check the id against the extension manifests in config/config.json)',
    ]);
  });

  it('renders extension manifests with their libraries and served command icons', async () => {
    const commands = manifest('CommandsCommandSet');
    expect(commands).toMatchObject({ componentType: 'Extension', extensionType: 'ListViewCommandSet', version: '1.2.0' });
    const iconUrl = (commands.items as Record<string, { iconImageUrl: string }>).COMMAND_1?.iconImageUrl;
    expect(iconUrl).toBe(`${origin}/src/extensions/commands/icon.png`);
    expect((await fetch(iconUrl ?? '')).status).toBe(200);
    expect(Object.keys(manifest('BannerApplicationCustomizer').loaderConfig.scriptResources).toSorted()).toEqual([
      '@microsoft/sp-application-base',
      '@microsoft/sp-loader',
      'banner-application-customizer',
    ]);
  });

  it('renders the ACE manifest like a web part manifest: served icon, entry bundle and the libraries of its lazy chunks', async () => {
    const ace = manifest('HelloAdaptiveCardExtension');
    expect(ace).toMatchObject({ componentType: 'AdaptiveCardExtension', version: '1.2.0', supportedHosts: ['Dashboard'] });
    const [entry] = ace.preconfiguredEntries as { iconImageUrl: string; cardSize: string }[];
    expect(entry).toMatchObject({ iconImageUrl: `${origin}/src/adaptiveCardExtensions/hello/assets/icon.png`, cardSize: 'Medium' });
    expect((await fetch(entry?.iconImageUrl ?? '')).status).toBe(200);
    const { loaderConfig } = ace;
    expect(loaderConfig).toMatchObject({ entryModuleId: 'hello-adaptive-card-extension', internalModuleBaseUrls: [`${origin}/dist/`] });
    expect(loaderConfig.scriptResources).toMatchObject({
      'hello-adaptive-card-extension': { type: 'path', path: 'hello-adaptive-card-extension.js' },
      '@microsoft/sp-adaptive-card-extension-base': { type: 'component', id: ACE_BASE_ID, version: '1.24.1' },
      '@microsoft/sp-property-pane': { type: 'component', id: PROPERTY_PANE_ID, version: '1.24.1' },
      '@microsoft/sp-loader': { type: 'component', id: SP_LOADER_ID },
    });
  });

  it('declares the libraries of the lazy property pane chunk on the entry define', async () => {
    const source = await (await fetch(`${origin}/dist/hello-adaptive-card-extension.js`)).text();
    expect(capturedDependencies(source).toSorted()).toEqual(['@microsoft/sp-adaptive-card-extension-base', '@microsoft/sp-property-pane']);
    expect(source).not.toContain('ACE_BASE_SOURCE');
    expect(source).not.toContain('PropertyPaneTextField()');
  });

  it('runs the card and quick views with the JSON template, the bundled image and the lazy property pane chunk', async () => {
    const source = await (await fetch(`${origin}/dist/hello-adaptive-card-extension.js`)).text();
    const exports = page.loadAmdBundle(source) as { default: new () => FakeAce };
    const ace = new exports.default();
    expect(ace).toBeInstanceOf(FakeBase);
    expect(ace.cardView.text).toBe('Card text');
    expect(ace.cardView.icon).toMatch(new RegExp(`^${origin}/dist/MicrosoftLogo_[0-9a-f]+\\.png$`));
    expect((await fetch(ace.cardView.icon)).status).toBe(200);
    expect(ace.quickView.template.body[0]?.text).toBe('${title}');
    expect(fetched.filter((url) => url.includes('property-pane'))).toEqual([]);
    await ace.loadPropertyPaneResources();
    expect(ace.propertyPane).toEqual({ field: PropertyPaneTextField, label: 'Card title' });
    expect(fetched).toContain(`${origin}/dist/chunk.Hello-property-pane.js`);
    await delay(500);
  });

  it('reloads the page when a card view changes', async () => {
    editFile('src/adaptiveCardExtensions/hello/cardView/CardView.ts', (content) => `${content}\nexport const edited = true;\n`);
    await waitFor(() => page.reloads() > 0, 'a reload after the card view edit');
    expect(page.reloads()).toBeGreaterThan(0);
  }, 30_000);

  it('reloads the page when a quick view template changes', async () => {
    const freshPage = createFakePage({ externals, fetch: recordingFetch });
    freshPage.loadAmdBundle(await (await fetch(`${origin}/dist/hello-adaptive-card-extension.js`)).text());
    await delay(500);
    editFile('src/adaptiveCardExtensions/hello/quickView/template/QuickViewTemplate.json', (content) => content.replace('${title}', '${subtitle}'));
    await waitFor(() => freshPage.reloads() > 0, 'a reload after the template edit');
    expect(freshPage.logs.filter((line) => !line.startsWith('debug:'))).toEqual([]);
  }, 30_000);

  it('keeps the browser console quiet', () => {
    expect(page.logs.filter((line) => !line.startsWith('debug:'))).toEqual([]);
  });
});
