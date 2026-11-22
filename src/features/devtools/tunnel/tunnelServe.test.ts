import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import tls from 'node:tls';
import { stripVTControlCharacters } from 'node:util';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '../../../shared/logger.js';
import type { DebugManifest } from '../../build/manifests/index.js';
import { startDevSession, type DevSession } from '../../../session/index.js';
import { COMPILE_FIXTURE, fakeExternals } from '../../../testing/compileKit.js';
import { freePort, selfSignedCertificate } from '../../../testing/devServerKit.js';
import { createFakePage, type FakePage } from '../../../testing/fakePage.js';

const TUNNEL_HOST = 'dev.contoso.example';
const TUNNEL_ORIGIN = `https://${TUNNEL_HOST}`;
const BUNDLES = ['single-web-part', 'shared-bundle'];
const FIRST_COMPONENT = 'src/webparts/first/components/First.tsx';
const FIRST = (version: string): string =>
  "import * as React from 'react';\n" +
  `(globalThis as unknown as Record<string, string>).firstVersion = '${version}';\n` +
  'export function First(): unknown {\n  return <section />;\n}\n' +
  "export function explode(): never {\n  throw new Error('exploded through the tunnel');\n}\n";

const EXTEND_FILE = `export default () => ({
  plugins: [{ [Symbol.for('spfx-fast-serve.tunnel-serve-plugin')]: true, options: { host: 'Dev.Contoso.Example' }, apply() {} }],
});
`;

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

function occurrences(text: string, part: string): number {
  return text.split(part).length - 1;
}

describe('tunnel mode: TunnelServePlugin in the extend file', { timeout: 30_000 }, () => {
  let root: string;
  let session: DevSession;
  let page: FakePage;
  const messages: string[] = [];
  const requested: string[] = [];
  const bundles = new Map<string, string>();

  const throughTunnel = (url: string): string => url.replace(new RegExp(`^(https|wss)://${TUNNEL_HOST.replaceAll('.', '\\.')}(?::443)?`), (_match, scheme: string) => session.localOrigin.replace('https', scheme));

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-tunnel-'));
    cpSync(COMPILE_FIXTURE, root, { recursive: true });
    mkdirSync(path.join(root, 'fast-serve'), { recursive: true });
    writeFileSync(path.join(root, 'fast-serve/rspack.extend.mjs'), EXTEND_FILE);
    mkdirSync(path.join(root, 'src/webparts/first/components'), { recursive: true });
    writeFileSync(path.join(root, FIRST_COMPONENT), FIRST('v1'));
    const firstWebPart = path.join(root, 'src/webparts/first/FirstWebPart.ts');
    writeFileSync(
      firstWebPart,
      `import { First, explode } from './components/First';\n${readFileSync(firstWebPart, 'utf8')}\nexport const view = First;\n(globalThis as unknown as Record<string, unknown>).explode = explode;\n`,
    );
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${stripVTControlCharacters(message)}`),
      warn: (message) => messages.push(`warn: ${stripVTControlCharacters(message)}`),
      error: (message) => messages.push(`error: ${stripVTControlCharacters(message)}`),
    };
    session = await startDevSession({
      root,
      cli: { typeCheck: false, port: await freePort() },
      logger,
      env: {},
      https: certificate,
      outputPath: path.join(root, 'out'),
      settleMs: 50,
      onRestartFailed: () => undefined,
    });
    const sources = await Promise.all(BUNDLES.map(async (bundle) => (await fetch(`${session.localOrigin}/dist/${bundle}.js`)).text()));
    for (const [index, bundle] of BUNDLES.entries()) bundles.set(bundle, sources[index] ?? '');
    class TunnelWebSocket extends WebSocket {
      constructor(url: string | URL, protocols?: ConstructorParameters<typeof WebSocket>[1]) {
        requested.push(String(url));
        super(throughTunnel(String(url)), protocols);
      }
    }
    page = createFakePage({
      externals: fakeExternals,
      fetch: (url, init) => {
        requested.push(url);
        return fetch(throughTunnel(url), init);
      },
      webSocket: TunnelWebSocket,
    });
    for (const bundle of BUNDLES) page.loadAmdBundle(bundles.get(bundle) ?? '', `${TUNNEL_ORIGIN}/dist/${bundle}.js`);
    await delay(1000);
  }, 60_000);

  afterAll(async () => {
    await session.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('serves under the tunnel origin and says so in the banner', () => {
    expect(session.origin).toBe(TUNNEL_ORIGIN);
    expect(session.localOrigin).toMatch(/^https:\/\/localhost:\d+$/);
    expect(messages).toContainEqual(expect.stringMatching(new RegExp(`^info: ready in \\d+ ms at ${TUNNEL_ORIGIN} \\(tunnel mode; your tunnel forwards to ${session.localOrigin}\\)$`)));
    expect(messages.join('\n')).not.toContain('debugManifestsFile');
  });

  it('lists the tunnel as the base URL in the debug manifests', async () => {
    const source = await (await fetch(`${session.localOrigin}/temp/build/manifests.js`)).text();
    let manifests: DebugManifest[] = [];
    vm.runInNewContext(source, {
      window: { addEventListener: () => undefined },
      define: (_dependencies: unknown, factory: () => { getManifests: () => DebugManifest[] }) => {
        manifests = factory().getManifests();
      },
    });
    expect(manifests.length).toBeGreaterThan(0);
    for (const manifest of manifests) expect(manifest.loaderConfig.internalModuleBaseUrls).toEqual([`${TUNNEL_ORIGIN}/dist/`]);
  });

  it('bakes the tunnel into the public path, the HMR client URL and the page runtime of every bundle', () => {
    for (const bundle of bundles.values()) {
      expect(bundle).toContain(`"${TUNNEL_ORIGIN}/dist/"`);
      expect(bundle).toContain(`protocol=wss&hostname=${TUNNEL_HOST}&port=443`);
      expect(bundle).not.toContain('hostname=localhost');
      expect(occurrences(bundle, `"reportUrl":"${TUNNEL_ORIGIN}/fast-serve/browser-errors"`)).toBe(1);
      expect(occurrences(bundle, `clearTunnelCaches)("${TUNNEL_HOST}")`)).toBe(1);
    }
  });

  it('sends the bundles with no-store so SharePoint mobile apps do not cache them', async () => {
    const response = await fetch(`${session.localOrigin}/dist/single-web-part.js`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('answers the strings file a heft development package lists', async () => {
    const response = await fetch(`${session.localOrigin}/dist/HelloWebPartStrings_en-us.js`);
    expect(response.status).toBe(200);
    expect(await response.text()).toBe('define([], function () {\n  return {\n    "Title": "Hello from en-us"\n  };\n});\n');
  });

  it('installs the page runtime from the bundles once per page and forwards errors to the tunnel origin', async () => {
    expect((page.window as Record<symbol, unknown>)[Symbol.for(`fast-serve.page:${TUNNEL_ORIGIN}`)]).toBe(true);
    page.evaluate('try { explode(); } catch (error) { window.dispatchEvent({ type: "error", error }); }');
    await waitFor(() => messages.some((message) => message.startsWith('error: [Unhandled error]')), 'the forwarded error');
    await delay(300);
    expect(messages.filter((message) => message.startsWith('error: [Unhandled error]'))).toHaveLength(1);
    expect(requested).toContain(`${TUNNEL_ORIGIN}/fast-serve/browser-errors`);
    page.dispatch('keydown', { key: 'Escape' });
  });

  it('hot-updates through the tunnel websocket', async () => {
    expect(requested).toContainEqual(expect.stringMatching(new RegExp(`^wss://${TUNNEL_HOST.replaceAll('.', '\\.')}(?::443)?/ws`)));
    expect(page.globals.firstVersion).toBe('v1');
    writeFileSync(path.join(root, FIRST_COMPONENT), FIRST('v2'));
    await waitFor(() => page.globals.firstVersion === 'v2', 'the hot update');
    expect(page.reloads()).toBe(0);
    expect(requested.some((url) => url.startsWith(`${TUNNEL_ORIGIN}/dist/`) && url.includes('.hot-update.'))).toBe(true);
  });
});
