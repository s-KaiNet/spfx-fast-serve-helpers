import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Logger } from '../shared/logger.js';
import { packageVersion } from '../shared/packageInfo.js';
import { assertPortFree } from '../server/index.js';
import { freePort, selfSignedCertificate } from '../../test/kit/devServerKit.js';
import { startDevSession, type DevSession } from './devSession.js';
import { fixturePath } from '../../test/kit/paths.js';

const fixture = fixturePath('compile');

interface Response {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function get(origin: string, urlPath: string): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = request(`${origin}${urlPath}`, { rejectUnauthorized: false }, (res) => {
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

const extendFile = (marker: string) => `import { api } from '../scripts/values.mjs';

export default ({ root }) => ({
  resolve: { alias: { '@src': root + '/src' } },
  plugins: [{ apply(compiler) { new compiler.webpack.DefinePlugin({ CONTOSO_API: JSON.stringify(api), CONTOSO_MARKER: JSON.stringify('${marker}') }).apply(compiler); } }],
  devServer: { port: 1, headers: { 'X-Contoso': '${marker}' } },
});
`;

describe('dev session restarts', { timeout: 30_000 }, () => {
  let root: string;
  let session: DevSession;
  const messages: string[] = [];
  const restartFailures: unknown[] = [];
  const portChecks: number[] = [];
  let port: number;

  const write = (file: string, content: string) => {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), content);
  };

  const waitFor = async (condition: () => boolean, what: string, timeoutMs = 20_000) => {
    const startedAt = Date.now();
    await new Promise<void>((resolve, reject) => {
      const poll = () => {
        if (condition()) resolve();
        else if (Date.now() - startedAt > timeoutMs) reject(new Error(`timed out waiting for ${what}\n${messages.join('\n')}`));
        else setTimeout(poll, 25);
      };
      poll();
    });
    await session.idle();
  };

  const waitForMessage = (pattern: RegExp, from: number) => waitFor(() => messages.slice(from).some((message) => pattern.test(message)), String(pattern));
  const bundle = async () => (await get(session.origin, '/dist/shared-bundle.js')).body;

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-session-'));
    cpSync(fixture, root, { recursive: true });
    write('scripts/values.mjs', "export const api = 'https://api.contoso.com/v1';");
    write('fast-serve/rspack.extend.mjs', extendFile('one'));
    write('src/webparts/first/contoso.ts', 'declare const CONTOSO_API: string;\ndeclare const CONTOSO_MARKER: string;\nexport const contoso = `${CONTOSO_API} ${CONTOSO_MARKER}`;\n');
    const firstWebPart = path.join(root, 'src/webparts/first/FirstWebPart.ts');
    writeFileSync(firstWebPart, `import { contoso } from '@src/webparts/first/contoso';\n${readFileSync(firstWebPart, 'utf8')}\nexport const contosoValue = contoso;\n`);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    port = await freePort();
    session = await startDevSession({
      root,
      cli: { typeCheck: false, port },
      portCheck: (checked) => {
        portChecks.push(checked);
        return assertPortFree(checked);
      },
      logger,
      env: {},
      https: selfSignedCertificate(root),
      outputPath: path.join(root, 'out'),
      settleMs: 50,
      onRestartFailed: (error) => restartFailures.push(error),
    });
  }, 60_000);

  afterAll(async () => {
    await session.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('starts with minimal output: versions, the extend file, the lint notice, the ready line and the debug query box', () => {
    const rule = `info: ${'═'.repeat(64)}`;
    const startup = messages.slice(0, messages.lastIndexOf(rule) + 1).filter((message) => message.startsWith('info:'));
    expect(startup).toEqual([
      `info: spfx-fast-serve-helpers ${packageVersion}, SPFx 1.24.1`,
      'info: Rspack config: fast-serve/rspack.extend.mjs',
      'info: lint is off: no eslint.config.js / eslint.config.mjs / eslint.config.cjs',
      expect.stringMatching(new RegExp(`^info: ready in \\d+ ms at https://localhost:${port}$`)),
      rule,
      'info:   To load your scripts, append this to your SharePoint page URL:',
      `info:   ?debugManifestsFile=https://localhost:${port}/temp/build/manifests.js&debug=true&noredir=true`,
      rule,
    ]);
  });

  it('applies the extend file: DefinePlugin values, the alias, dev-server headers, guard warnings', async () => {
    expect(messages).toContain('info: Rspack config: fast-serve/rspack.extend.mjs');
    expect(messages).toContain('warn: fast-serve/rspack.extend.mjs: "devServer.port" is ignored (use --port or "port" in fast-serve/config.json)');
    expect(messages.some((message) => message.startsWith('info: hint:'))).toBe(false);
    expect(await bundle()).toContain('"https://api.contoso.com/v1"');
    const response = await get(session.origin, '/dist/shared-bundle.js');
    expect(response.headers['x-contoso']).toBe('one');
    expect(response.headers['access-control-allow-origin']).toBe('*');
  });

  it('restarts when a file imported by the extend file changes', async () => {
    const from = messages.length;
    write('scripts/values.mjs', "export const api = 'https://api.contoso.com/v2';");
    await waitFor(() => session.restarts === 1, 'restart 1');
    expect(messages.slice(from)).toContain('info: scripts/values.mjs (imported by fast-serve/rspack.extend.mjs) changed, restarting fast-serve');
    expect(await bundle()).toContain('"https://api.contoso.com/v2"');
  });

  it('keeps the server running on a broken edit and restarts once the file is fixed', async () => {
    let from = messages.length;
    write('fast-serve/rspack.extend.mjs', 'export default {;');
    await waitForMessage(/could not be loaded/, from);
    const error = messages.slice(from).find((message) => message.includes('could not be loaded')) ?? '';
    expect(error).toMatch(/^error: fast-serve\/rspack\.extend\.mjs could not be loaded:\nin fast-serve\/rspack\.extend\.mjs\n.*parse failed/);
    expect(error).not.toContain('sourceDirLoader');
    expect(error).toContain('The server keeps running with the previous configuration; fast-serve restarts when the file is fixed.');
    expect(session.restarts).toBe(1);
    expect(await bundle()).toContain('"https://api.contoso.com/v2"');

    from = messages.length;
    write('fast-serve/rspack.extend.mjs', extendFile('two'));
    await waitFor(() => session.restarts === 2, 'restart 2');
    expect(messages.slice(from)).toContain('info: fast-serve/rspack.extend.mjs changed, restarting fast-serve');
    expect(await bundle()).toContain('"two"');
    expect((await get(session.origin, '/dist/shared-bundle.js')).headers['x-contoso']).toBe('two');
  });

  it('restarts on config/sass.json and keeps the old server when config/config.json is broken', async () => {
    let from = messages.length;
    write('config/sass.json', '{ "silenceDeprecations": ["import"] }');
    await waitFor(() => session.restarts === 3, 'restart 3');
    expect(messages.slice(from)).toContain('info: config/sass.json changed, restarting fast-serve');

    from = messages.length;
    const config = readFileSync(path.join(root, 'config/config.json'), 'utf8');
    write('config/config.json', '{ "bundles": ');
    await waitForMessage(/restart failed/, from);
    expect(session.restarts).toBe(3);
    expect((await get(session.origin, '/dist/shared-bundle.js')).status).toBe(200);
    write('config/config.json', config);
    await waitFor(() => session.restarts === 4, 'restart 4');
  });

  it('restarts without the extend file when it is removed', async () => {
    const from = messages.length;
    rmSync(path.join(root, 'fast-serve/rspack.extend.mjs'));
    await waitFor(() => session.restarts === 5, 'restart 5');
    expect(messages.slice(from)).toContain('info: fast-serve/rspack.extend.mjs was removed, restarting fast-serve');
    expect((await get(session.origin, '/dist/shared-bundle.js')).headers['x-contoso']).toBeUndefined();
    expect(restartFailures).toEqual([]);
  });

  it('runs the start-up port check once, never on restarts', () => {
    expect(portChecks).toEqual([port]);
  });
});
