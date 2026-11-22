import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../../../config/options.js';
import type { Logger } from '../../../shared/logger.js';
import { createProject } from '../../../project/index.js';
import { startDevServer, type RunningDevServer } from '../../../server/index.js';
import { freePort, selfSignedCertificate } from '../../../testing/devServerKit.js';
import { createFakePage, type FakePage } from '../../../testing/fakePage.js';

const fixture = fileURLToPath(new URL('../../../../test/fixtures/compile', import.meta.url));
const projectRequire = createRequire(import.meta.url);

class FakeBaseClientSideWebPart {
  public readonly kind: string = 'web part';
}
const externals: Record<string, unknown> = {
  '@microsoft/sp-core-library': { Version: { parse: (value: string) => value } },
  '@microsoft/sp-webpart-base': { BaseClientSideWebPart: FakeBaseClientSideWebPart },
  '@microsoft/microsoft-graph-client': { GraphClient: FakeBaseClientSideWebPart },
};

const GREETING = (version: string): string =>
  "import * as React from 'react';\nimport styles from './Greeting.module.scss';\n" +
  `(globalThis as unknown as Record<string, string>).greetingVersion = '${version}';\n` +
  'export function Greeting(): unknown {\n  return <div className={styles.greeting} />;\n}\n';

const FIRST = (version: string): string =>
  "import * as React from 'react';\n" +
  `(globalThis as unknown as Record<string, string>).firstVersion = '${version}';\n` +
  'export function First(): unknown {\n  return <section />;\n}\n';

const GREETING_STYLES = (color: string): string => `.greeting { color: ${color}; }\n`;

function packageDirectory(request: string): string {
  return path.dirname(projectRequire.resolve(`${request}/package.json`));
}

function prepareProject(root: string): void {
  cpSync(fixture, root, { recursive: true });
  mkdirSync(path.join(root, 'node_modules', '@microsoft'), { recursive: true });
  symlinkSync(packageDirectory('@microsoft/sp-css-loader'), path.join(root, 'node_modules', '@microsoft', 'sp-css-loader'), 'dir');
  symlinkSync(path.resolve(projectRequire.resolve('sass-embedded'), '../../..'), path.join(root, 'node_modules', 'sass-embedded'), 'dir');
  const hello = path.join(root, 'src', 'webparts', 'hello', 'components');
  writeFileSync(path.join(hello, 'Greeting.tsx'), GREETING('v1'));
  writeFileSync(path.join(hello, 'Greeting.module.scss'), GREETING_STYLES('red'));
  writeFileSync(
    path.join(hello, 'Hello.tsx'),
    "import * as React from 'react';\nimport { Greeting } from './Greeting';\nimport type { IHelloProps } from './IHelloProps';\n" +
      'export function renderHello({ title }: IHelloProps): unknown {\n  return <Greeting title={title} />;\n}\n',
  );
  const first = path.join(root, 'src', 'webparts', 'first');
  mkdirSync(path.join(first, 'components'), { recursive: true });
  writeFileSync(path.join(first, 'components', 'First.tsx'), FIRST('v1'));
  const firstWebPart = path.join(first, 'FirstWebPart.ts');
  writeFileSync(firstWebPart, `import { First } from './components/First';\n${readFileSync(firstWebPart, 'utf8')}\nexport const view = First;\n`);
}

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

const hotUpdateResponses: { url: string; cacheControl: string | null }[] = [];

async function recordingFetch(url: string): Promise<Response> {
  const response = await fetch(url);
  if (url.includes('.hot-update.')) hotUpdateResponses.push({ url, cacheControl: response.headers.get('cache-control') });
  return response;
}

describe('hot updates inside the AMD bundles of a page with two bundles', () => {
  let root: string;
  let server: RunningDevServer;
  let page: FakePage;
  const messages: string[] = [];

  const edit = (relativePath: string, content: string): void => {
    writeFileSync(path.join(root, relativePath), content);
  };

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-hmr-'));
    prepareProject(root);
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const project = createProject(root, logger);
    const port = await freePort();
    const options = resolveOptions({ cli: { typeCheck: false, port }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root, project, options }, logger, https: certificate, outputPath: path.join(root, 'out') });
    page = createFakePage({ externals, fetch: recordingFetch });
    const bundles = await Promise.all(['single-web-part', 'shared-bundle'].map(async (bundle) => (await fetch(`${server.origin}/dist/${bundle}.js`)).text()));
    for (const bundle of bundles) page.loadAmdBundle(bundle);
    await delay(1000);
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('runs both bundles and inserts their styles', () => {
    expect(messages.filter((message) => message.startsWith('error:'))).toEqual([]);
    expect(page.globals.greetingVersion).toBe('v1');
    expect(page.globals.firstVersion).toBe('v1');
    expect(page.styles()).toEqual([expect.stringMatching(/^\.greeting_[0-9a-f]{8}\{color:red\}/)]);
  });

  it('applies an edit of a component in the first bundle without a reload', async () => {
    edit('src/webparts/hello/components/Greeting.tsx', GREETING('v2'));
    await waitFor(() => page.globals.greetingVersion === 'v2', 'the first bundle to apply the update');
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('applies an edit of a component in the second bundle without a reload', async () => {
    edit('src/webparts/first/components/First.tsx', FIRST('v2'));
    await waitFor(() => page.globals.firstVersion === 'v2', 'the second bundle to apply the update');
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('applies style edits without piling up style elements', async () => {
    edit('src/webparts/hello/components/Greeting.module.scss', GREETING_STYLES('blue'));
    await waitFor(() => page.styles().some((style) => style.includes('color:blue')), 'the first style edit');
    edit('src/webparts/hello/components/Greeting.module.scss', GREETING_STYLES('green'));
    await waitFor(() => page.styles().some((style) => style.includes('color:green')), 'the second style edit');
    expect(page.styles()).toEqual([
      expect.stringMatching(/^\.greeting_[0-9a-f]{8}\{color:red\}/),
      expect.stringMatching(/^\.greeting_[0-9a-f]{8}\{color:green\}/),
    ]);
    expect(page.reloads()).toBe(0);
  }, 30_000);

  it('serves hot-update files uncached', () => {
    expect(hotUpdateResponses.length).toBeGreaterThan(0);
    expect(hotUpdateResponses.filter(({ cacheControl }) => cacheControl !== 'no-store')).toEqual([]);
  });

  it('reloads the page when an edit reaches the web part class', async () => {
    edit('src/webparts/hello/HelloWebPart.ts', `${readFileSync(path.join(root, 'src/webparts/hello/HelloWebPart.ts'), 'utf8')}\nexport const edited = true;\n`);
    await waitFor(() => page.reloads() > 0, 'a page reload');
    expect(page.reloads()).toBeGreaterThan(0);
  }, 30_000);

  it('keeps the browser console quiet', () => {
    expect(page.logs.filter((line) => !line.startsWith('debug:'))).toEqual([]);
  });
});
