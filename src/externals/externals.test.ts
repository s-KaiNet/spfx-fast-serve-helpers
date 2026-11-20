import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import type { DebugManifest } from '../manifests/index.js';
import { createProject } from '../project/index.js';
import { startDevServer, type RunningDevServer } from '../server/index.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { createFakePage, type FakePage } from '../testing/fakePage.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/externals', import.meta.url));

function render(template: string): string {
  return `rendered ${template}`;
}
function compile(): string {
  return 'compiled';
}
class ApexCharts {
  public readonly kind: string = 'apexcharts';
}
const ejsModule = { render, compile };
const legacyChart = { draw: () => 'drawn' };
const externals: Record<string, unknown> = {
  '@microsoft/sp-core-library': { Version: 'core version' },
  '@contoso/spfx-lib': { __esModule: true, default: () => 'greeting from SharePoint' },
  ejs: ejsModule,
  apexcharts: ApexCharts,
  'legacy-chart': legacyChart,
};

interface ProbeWebPart {
  version: unknown;
  textField: unknown;
  deepDefault: unknown;
  render: unknown;
  ejsNamespace: unknown;
  apexDefault: unknown;
  apexNamespace: unknown;
  legacyChart: unknown;
  title: string;
  tsGreeting: string;
  tsDefaultGreeting: string;
  controlLabel: string;
  controlToggle: string;
  reexports: Record<string, unknown>;
  loadLazy(): Promise<string>;
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

describe('SPFx libraries, config.json externals and localized strings on the dev server', () => {
  let root: string;
  let server: RunningDevServer;
  let origin: string;
  let bundle: string;
  let page: FakePage;
  let webPart: ProbeWebPart;
  const messages: string[] = [];

  const edit = (relativePath: string, change: (content: string) => string): void => {
    const file = path.join(root, relativePath);
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-externals-'));
    cpSync(fixture, root, { recursive: true });
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const project = createProject(root, logger);
    const port = await freePort();
    const options = resolveOptions({ cli: { port }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root, project, options }, logger, https: certificate, outputPath: path.join(root, 'out') });
    origin = server.origin;
    bundle = await (await fetch(`${origin}/dist/probe-web-part.js`)).text();
    page = createFakePage({ externals, fetch });
    const exports = page.loadAmdBundle(bundle) as { default: new () => ProbeWebPart };
    webPart = new exports.default();
    await delay(500);
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('compiles without errors and warns about the ES module loc file and the project\'s deep library import, naming the importer', () => {
    expect(messages.filter((message) => message.startsWith('error:'))).toEqual([]);
    expect(messages.filter((message) => message.startsWith('warn:'))).toEqual([
      'warn: TsStrings: src/webparts/probe/tsLoc/en-us.ts is an ES/CommonJS module. fast-serve loads it, but heft copies the compiled lib/ file into dist/ as is and SharePoint loads it with RequireJS, which needs `define([], function () { return { ... }; });`',
      'warn: src/webparts/probe/ProbeWebPart.ts imports "@microsoft/sp-property-pane/lib/fields/PropertyPaneTextField", a deep import into the SPFx library @microsoft/sp-property-pane: it is bundled as a separate copy, not the instance SharePoint loads; import from "@microsoft/sp-property-pane" instead',
    ]);
    expect(messages).toContainEqual(expect.stringMatching(/^info: compiled in \d+ ms$/));
  });

  it('declares SPFx libraries, lazy-chunk libraries and used config.json externals on the bundle define', () => {
    expect(capturedDependencies(bundle).toSorted()).toEqual([
      '@contoso/spfx-lib',
      '@microsoft/sp-core-library',
      'apexcharts',
      'ejs',
      'legacy-chart',
    ]);
    for (const marker of ['SP_CORE_LIBRARY_SOURCE', 'CONTOSO_SPFX_LIB_SOURCE', 'drawn with']) expect(bundle).not.toContain(marker);
  });

  it('bundles a deep import into a library like heft, with that file\'s own library imports as externals', () => {
    expect(bundle).toContain('SP_PROPERTY_PANE_SOURCE');
    expect(webPart.textField).toBe(webPart.deepDefault);
    expect((webPart.textField as () => string)()).toBe('bundled copy core version');
  });

  it('bundles a dependency\'s deep import into a library silently, like heft', () => {
    expect(bundle).toContain('SP_PROPERTY_PANE_TOGGLE_SOURCE');
    expect(webPart.controlToggle).toBe('bundled toggle');
    expect(messages.filter((message) => message.includes('PropertyPaneToggle'))).toEqual([]);
  });

  it('lists libraries and the used config.json externals with their global dependencies in the manifest, like heft', async () => {
    const [manifest] = evaluateManifests(await (await fetch(`${origin}/temp/build/manifests.js`)).text());
    expect(manifest?.loaderConfig.scriptResources).toEqual({
      'probe-web-part': { type: 'path', path: 'probe-web-part.js' },
      '@contoso/spfx-lib': { type: 'component', id: 'c0000000-0000-0000-0000-00000000c0de', version: '2.1.0' },
      '@microsoft/sp-core-library': { type: 'component', id: '7263c7d0-1d6a-45ec-8d85-d4d1d234171b', version: '1.24.1' },
      '@microsoft/sp-loader': { type: 'component', id: '1c6c9123-7aac-41f3-a376-3caea41ed83f', version: '1.24.1' },
      apexcharts: { type: 'path', path: 'apexcharts.js', globalName: 'ApexCharts' },
      ejs: { type: 'path', path: 'https://cdn.example.com/ejs.min.js' },
      'legacy-chart': { type: 'path', path: 'legacy-chart.js', globalName: 'LegacyChart', globalDependencies: ['legacy-dep'] },
      'legacy-dep': { type: 'path', path: 'legacy-dep.js', globalName: 'LegacyDep' },
    });
  });

  it('serves local-file externals next to the bundles with the CORS headers', async () => {
    const names = ['apexcharts', 'legacy-chart', 'legacy-dep'];
    const responses = await Promise.all(names.map(async (name) => fetch(`${origin}/dist/${name}.js`)));
    const texts = await Promise.all(responses.map(async (response) => response.text()));
    for (const [index, name] of names.entries()) {
      expect(responses[index]?.status).toBe(200);
      expect(responses[index]?.headers.get('access-control-allow-origin')).toBe('*');
      expect(texts[index]).toBe(readFileSync(path.join(root, 'externals', `${name}.js`), 'utf8'));
    }
  });

  it('reads named, namespace and default imports from externals at runtime, like webpack', () => {
    expect(webPart.version).toBe('core version');
    expect(webPart.render).toBe(render);
    expect(webPart.ejsNamespace).toBe(ejsModule);
    expect(webPart.apexDefault).toBe(ApexCharts);
    expect(webPart.apexNamespace).toBe(ApexCharts);
    expect(webPart.legacyChart).toBe(legacyChart);
  });

  it('re-exports names from externals, including export * at runtime', () => {
    const { reexports } = webPart;
    expect(reexports.render).toBe(render);
    expect(reexports.compile).toBe(compile);
    expect(reexports.renderTemplate).toBe(render);
    expect(reexports.ejsNamespace).toBe(ejsModule);
    expect(reexports.Apex).toBe(ApexCharts);
  });

  it('loads a lazy chunk that uses a third-party SPFx library from the page', async () => {
    expect(await webPart.loadLazy()).toBe('greeting from SharePoint');
  });

  it('bundles the strings of AMD, TypeScript and library loc files', () => {
    expect(webPart.title).toBe('Probe title');
    expect(webPart.tsGreeting).toBe('Hi from a TypeScript loc file');
    expect(webPart.tsDefaultGreeting).toBe('Hi from a TypeScript loc file');
    expect(webPart.controlLabel).toBe('Search');
    expect(page.globals.labelText).toBe('Label text');
  });

  it('hot-updates the components that use an edited strings file', async () => {
    edit('src/webparts/probe/components/loc/en-us.js', (content) => content.replace('Label text', 'Edited label'));
    await waitFor(() => page.globals.labelText === 'Edited label', 'the label to re-render with the edited string');
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('reloads the page when a local-file external changes', async () => {
    edit('externals/apexcharts.js', (content) => `${content}window.ApexChartsEdited = true;\n`);
    await waitFor(() => page.reloads() > 0, 'a reload after the external edit');
    expect(await (await fetch(`${origin}/dist/apexcharts.js`)).text()).toContain('ApexChartsEdited');
  }, 30_000);

  it('reloads the page when an edited strings file is used by the web part class', async () => {
    const reloadsBefore = page.reloads();
    edit('src/webparts/probe/loc/en-us.js', (content) => content.replace('Probe title', 'Edited title'));
    await waitFor(() => page.reloads() > reloadsBefore, 'a reload after the strings edit');
    expect(page.reloads()).toBe(reloadsBefore + 1);
  }, 30_000);

  it('reloads the page instead of hot-updating when an edit adds a library the bundle did not declare', async () => {
    const reloadsBefore = page.reloads();
    edit('src/webparts/probe/components/Label.tsx', (content) =>
      content.replace("import * as React from 'react';", "import * as React from 'react';\nimport { SPComponentLoader } from '@microsoft/sp-loader';\nexport const loader = SPComponentLoader;"),
    );
    await waitFor(() => page.reloads() > reloadsBefore, 'a reload after adding a library import');
    const updated = await (await fetch(`${origin}/dist/probe-web-part.js`)).text();
    expect(capturedDependencies(updated)).toContain('@microsoft/sp-loader');
  }, 30_000);

  it('keeps the browser console quiet', () => {
    expect(page.logs.filter((line) => !line.startsWith('debug:'))).toEqual([]);
  });
});
