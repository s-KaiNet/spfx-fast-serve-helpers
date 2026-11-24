import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../shared/logger.js';
import type { DebugManifest } from '../features/build/manifests/index.js';
import { createProject } from '../project/index.js';
import { freePort, selfSignedCertificate } from '../../test/kit/devServerKit.js';
import { startDevServer, type RunningDevServer } from './devServer.js';
import { assertPortFree } from './port.js';
import { fixturePath } from '../../test/kit/paths.js';

const fixture = fixturePath('compile');

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function send(origin: string, urlPath: string, method = 'GET', headers: Record<string, string> = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${urlPath}`, { method, headers, rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function evaluateManifests(source: string): DebugManifest[] {
  let manifests: DebugManifest[] | undefined;
  const define = (dependencies: string[], factory: () => { getManifests(): DebugManifest[] }) => {
    expect(dependencies).toEqual([]);
    manifests = factory().getManifests();
  };
  vm.runInNewContext(source, { define });
  if (!manifests) throw new Error('manifests.js did not call define()');
  return manifests;
}

function expectCorsHeaders(response: Response): void {
  expect(response.headers).toMatchObject({
    'access-control-allow-origin': '*',
    'access-control-allow-private-network': 'true',
  });
}

describe('startDevServer on a fixture project', () => {
  let root: string;
  let server: RunningDevServer;
  let port: number;
  const messages: string[] = [];

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-dev-server-'));
    cpSync(fixture, root, { recursive: true });
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const project = createProject(root, logger);
    port = await freePort();
    const options = resolveOptions({ cli: { typeCheck: false, port }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root, project, options }, logger, https: selfSignedCertificate(root), outputPath: path.join(root, 'out') });
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('compiles quietly and prints the ready banner with the debug query for its port', () => {
    expect(messages.filter((message) => message.startsWith('error:'))).toEqual([]);
    expect(messages).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^info: ready in \\d+ ms at https://localhost:${port}$`))]));
    expect(messages).toContain(`info:   ?debugManifestsFile=https://localhost:${port}/temp/build/manifests.js&debug=true&noredir=true`);
    expect(messages.join('\n')).not.toContain('compiled in');
  });

  it('serves manifests.js as an uncached AMD module pointing the loader at the bundles on this port', async () => {
    const response = await send(server.origin, '/temp/build/manifests.js');
    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers['content-type']).toMatch(/^application\/javascript/);
    expectCorsHeaders(response);
    const manifests = evaluateManifests(response.body);
    expect(manifests.map(({ alias, loaderConfig }) => [alias, loaderConfig.entryModuleId, loaderConfig.exportName])).toEqual([
      ['HelloWebPart', 'single-web-part', undefined],
      ['FirstWebPart', 'shared-bundle', 'a'],
      ['BannerApplicationCustomizer', 'shared-bundle', 'b'],
    ]);
    const [hello, first] = manifests;
    expect(hello?.loaderConfig.internalModuleBaseUrls).toEqual([`https://localhost:${port}/dist/`]);
    expect(hello?.version).toBe('1.0.0');
    expect(hello?.preconfiguredEntries).toEqual([{ title: { default: 'Hello' }, iconImageUrl: `https://localhost:${port}/src/webparts/hello/assets/logo.png` }]);
    expect(hello?.loaderConfig.scriptResources).toEqual({
      'single-web-part': { type: 'path', path: 'single-web-part.js' },
      '@microsoft/sp-core-library': { type: 'component', id: '7263c7d0-1d6a-45ec-8d85-d4d1d234171b', version: '1.23.2' },
      '@microsoft/sp-webpart-base': { type: 'component', id: '974a7777-0990-4136-8fa6-95d80114c2e0', version: '1.23.2' },
      '@microsoft/sp-loader': { type: 'component', id: '1c6c9123-7aac-41f3-a376-3caea41ed83f', version: '1.23.2' },
    });
    expect(Object.keys(first?.loaderConfig.scriptResources ?? {})).toEqual([
      'shared-bundle',
      '@microsoft/microsoft-graph-client',
      '@microsoft/sp-core-library',
      '@microsoft/sp-loader',
    ]);
  });

  it('serves the bundles from memory under /dist/ with CORS and private network headers', async () => {
    const response = await send(server.origin, '/dist/single-web-part.js');
    expect(response.status).toBe(200);
    expectCorsHeaders(response);
    expect(response.body.trimStart()).toMatch(/^define\(\[/);
    expect(response.body).toContain(`protocol=wss&hostname=localhost&port=${port}`);
    expect(await send(server.origin, '/dist/single-web-part.js', 'GET', { 'sec-fetch-mode': 'no-cors', 'sec-fetch-site': 'cross-site' })).toMatchObject({
      status: 200,
    });
  });

  it('answers preflight requests from the SharePoint page', async () => {
    const response = await send(server.origin, '/dist/single-web-part.js', 'OPTIONS', {
      origin: 'https://contoso.sharepoint.com',
      'access-control-request-method': 'GET',
      'access-control-request-private-network': 'true',
    });
    expect(response.status).toBe(204);
    expectCorsHeaders(response);
  });

  it('serves manifest icons but nothing else from the project folder', async () => {
    const icon = await send(server.origin, '/src/webparts/hello/assets/logo.png');
    expect(icon.status).toBe(200);
    expect(icon.headers['content-type']).toBe('image/png');
    const others = await Promise.all(['/package.json', '/src/webparts/hello/HelloWebPart.ts', '/config/config.json', '/'].map((urlPath) => send(server.origin, urlPath)));
    expect(others.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
  });

  it('reports its port as taken while it runs and releases it when closed', async () => {
    await expect(assertPortFree(port)).rejects.toThrow(`Port ${port} is already in use`);
    await server.close();
    await expect(assertPortFree(port)).resolves.toBeUndefined();
  });
});
