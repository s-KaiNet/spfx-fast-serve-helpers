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

const SP_LOADER_ID = '1c6c9123-7aac-41f3-a376-3caea41ed83f';

class FakeWebPartBase {
  public readonly host: string = 'page';
}
const externals: Record<string, unknown> = {
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeWebPartBase },
};

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

describe('a web part and a library component in separate bundles', () => {
  const defaultCaCertificates = tls.getCACertificates('default');
  let root: string;
  let server: RunningDevServer;
  let origin: string;
  let page: FakePage;
  const messages: string[] = [];

  const editFile = (relativePath: string, change: (content: string) => string): void => {
    const file = path.join(root, relativePath);
    writeFileSync(file, change(readFileSync(file, 'utf8')));
  };
  const manifests = async (): Promise<DebugManifest[]> => evaluateManifests(await (await fetch(`${origin}/temp/build/manifests.js`)).text());
  const manifest = async (alias: string): Promise<DebugManifest> => {
    const found = (await manifests()).find((entry) => entry.alias === alias);
    if (!found) throw new Error(`no manifest for ${alias}`);
    return found;
  };
  const warnings = (): string[] => messages.filter((message) => message.startsWith('warn:') || message.startsWith('error:'));

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-library-bundle-'));
    cpSync(fixturePath('library-bundle'), root, { recursive: true });
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...defaultCaCertificates, certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const port = await freePort();
    origin = `https://localhost:${port}`;
    const setup = prepareServe({ root, cli: { typeCheck: false, lint: false, port }, logger, env: {} });
    server = await startDevServer({ setup, logger, https: certificate, outputPath: path.join(root, 'out') });
    page = createFakePage({ externals, fetch: (url) => fetch(url) });
  }, 60_000);

  afterAll(async () => {
    await server.close();
    tls.setDefaultCACertificates(defaultCaCertificates);
    rmSync(root, { recursive: true, force: true });
  });

  it('builds and lists a library-only bundle so deployed components can load it from the dev server', async () => {
    expect(await manifest('ToolsLibrary')).toEqual({
      id: '40000000-0000-0000-0000-000000000003',
      alias: 'ToolsLibrary',
      componentType: 'Library',
      version: '1.3.0',
      manifestVersion: 2,
      loaderConfig: {
        internalModuleBaseUrls: [`${origin}/dist/`],
        entryModuleId: 'tools-library',
        scriptResources: {
          'tools-library': { type: 'path', path: 'tools-library.js' },
          '@microsoft/sp-loader': { type: 'component', id: SP_LOADER_ID, version: '1.23.2' },
        },
      },
    });
    const exports = page.loadAmdBundle(await (await fetch(`${origin}/dist/tools-library.js`)).text()) as { formatTool(name: string): string };
    expect(exports.formatTool('hammer')).toBe('tool: hammer');
    expect((await manifest('HelloWebPart')).loaderConfig.entryModuleId).toBe('hello-web-part');
    expect(warnings()).toEqual([]);
  });

  it('serves the web part bundle', async () => {
    const response = await fetch(`${origin}/dist/hello-web-part.js`);
    expect(response.status).toBe(200);
    const exports = page.loadAmdBundle(await response.text()) as { default: new () => FakeWebPartBase & { greeting: string } };
    const webPart = new exports.default();
    expect(webPart).toBeInstanceOf(FakeWebPartBase);
    expect(webPart.greeting).toBe('Hello web part');
  });

  it('reloads the page when the web part class changes', async () => {
    await delay(500);
    editFile('src/webparts/hello/HelloWebPart.ts', (content) => content.replace("'Hello web part'", "'Hello again'"));
    await waitFor(() => page.reloads() > 0, 'a reload after the web part class edit');
    expect(page.reloads()).toBeGreaterThan(0);
  }, 30_000);
});
