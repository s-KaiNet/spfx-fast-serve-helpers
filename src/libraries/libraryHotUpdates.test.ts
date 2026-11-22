import { writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../shared/logger.js';
import type { DebugManifest } from '../manifests/index.js';
import { createProject } from '../project/index.js';
import { startDevServer, type RunningDevServer } from '../server/index.js';
import { copyCompileFixture, copyLibraryFixture, LIBRARY_PACKAGE, type FixtureCopy, type LibraryCopy } from '../testing/compileKit.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { createFakePage, type FakePage } from '../testing/fakePage.js';

class FakeBaseClientSideWebPart {
  public readonly kind: string = 'web part';
}

const externals: Record<string, unknown> = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string) => value } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeBaseClientSideWebPart },
  '@microsoft/microsoft-graph-client': { GraphClient: FakeBaseClientSideWebPart },
  'corp-legacy': { chart: 'legacy chart' },
};

const BADGE = (version: string): string =>
  "import * as React from 'react';\nimport styles from './Badge.module.scss';\n" +
  `(globalThis as unknown as Record<string, string>).badgeVersion = '${version}';\n` +
  'export function Badge(): unknown {\n  return <span className={styles.badge} />;\n}\n';

const BADGE_STYLES = (color: string): string => `.badge { color: ${color}; }\n`;

const VIEW = (version: string): string =>
  "import * as React from 'react';\nimport { Badge } from '@contoso/corp-lib';\n" +
  `(globalThis as unknown as Record<string, string>).viewVersion = '${version}';\n` +
  'export function View(): unknown {\n  return <Badge />;\n}\n';

const WEB_PART = `import { BaseClientSideWebPart } from '@microsoft/sp-webpart-base';
import { CorpLibrary } from '${LIBRARY_PACKAGE}';
import { legacyChart } from '${LIBRARY_PACKAGE}/lib/legacy';
import { View } from './components/View';

(globalThis as unknown as Record<string, unknown>).greeting = new CorpLibrary().greet('anna');

export default class HelloWebPart extends BaseClientSideWebPart {
  public readonly view: unknown = View;
  public readonly chart: unknown = legacyChart;
}
`;

function evaluateManifests(source: string): DebugManifest[] {
  let manifests: DebugManifest[] | undefined;
  vm.runInNewContext(source, { define: (_dependencies: string[], factory: () => { getManifests(): DebugManifest[] }) => (manifests = factory().getManifests()) });
  if (!manifests) throw new Error('manifests.js did not call define()');
  return manifests;
}

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

describe('hot updates across the project and a linked library project', () => {
  let consumer: FixtureCopy;
  let library: LibraryCopy;
  let server: RunningDevServer;
  let page: FakePage;
  const messages: string[] = [];

  beforeAll(async () => {
    library = copyLibraryFixture();
    consumer = copyCompileFixture({ 'src/webparts/hello/HelloWebPart.ts': WEB_PART, 'src/webparts/hello/components/View.tsx': VIEW('v1') });
    for (const name of ['@microsoft/sp-css-loader', 'sass-embedded']) consumer.linkPackage(name);
    consumer.linkLocalPackage(LIBRARY_PACKAGE, library.root);
    const certificate = selfSignedCertificate(consumer.root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const root = consumer.root;
    const project = createProject(root, logger);
    const port = await freePort();
    const options = resolveOptions({ cli: { typeCheck: false, port }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root, project, options }, logger, https: certificate, outputPath: path.join(root, 'out'), persistentCache: false });
    page = createFakePage({ externals, fetch });
    page.loadAmdBundle(await (await fetch(`${server.origin}/dist/single-web-part.js`)).text());
    await delay(1000);
  }, 60_000);

  afterAll(async () => {
    await server.close();
    consumer.remove();
    library.remove();
  });

  it('runs the library code inside the project bundle', () => {
    expect(messages.filter((message) => message.startsWith('error:'))).toEqual([]);
    expect(page.globals.greeting).toBe('Hello from the library, ANNA');
    expect(page.globals.badgeVersion).toBe('v1');
    expect(page.styles()).toEqual([expect.stringMatching(/^\.badge_[0-9a-f]{8}\{color:red\}/)]);
  });

  it('lists the library config.json externals in the debug manifest', async () => {
    const manifests = evaluateManifests(await (await fetch(`${server.origin}/temp/build/manifests.js`)).text());
    const resources = manifests.find((manifest) => manifest.loaderConfig.entryModuleId === 'single-web-part')?.loaderConfig.scriptResources;
    expect(resources?.['corp-legacy']).toEqual({ type: 'path', path: 'https://cdn.contoso.com/corp-legacy.js', globalName: 'CorpLegacy' });
    expect(resources?.[LIBRARY_PACKAGE]).toBeUndefined();
  });

  it('applies an edit of a library component without a reload', async () => {
    writeFileSync(path.join(library.root, 'src/components/Badge.tsx'), BADGE('v2'));
    await waitFor(() => page.globals.badgeVersion === 'v2', 'the library component update');
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('swaps library styles without a reload', async () => {
    writeFileSync(path.join(library.root, 'src/components/Badge.module.scss'), BADGE_STYLES('blue'));
    await waitFor(() => page.styles().some((style) => style.includes('color:blue')), 'the library style edit');
    writeFileSync(path.join(library.root, 'src/components/Badge.module.scss'), BADGE_STYLES('green'));
    await waitFor(() => page.styles().some((style) => style.includes('color:green')), 'the second library style edit');
    expect(page.styles()).toEqual([expect.stringMatching(/^\.badge_[0-9a-f]{8}\{color:red\}/), expect.stringMatching(/^\.badge_[0-9a-f]{8}\{color:green\}/)]);
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('still applies an edit of a project component that uses the library', async () => {
    consumer.write('src/webparts/hello/components/View.tsx', VIEW('v2'));
    await waitFor(() => page.globals.viewVersion === 'v2', 'the project component update');
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('reloads the page when the library loc strings change', async () => {
    writeFileSync(path.join(library.root, 'src/loc/en-us.js'), 'define([], function () {\n  return { "Greeting": "Hi" };\n});\n');
    await waitFor(() => page.reloads() > 0, 'a page reload');
    expect(page.reloads()).toBeGreaterThan(0);
  }, 30_000);

  it('keeps the browser console quiet', () => {
    expect(page.logs.filter((line) => !line.startsWith('debug:'))).toEqual([]);
  });
});
