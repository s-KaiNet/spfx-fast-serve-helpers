import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import tls from 'node:tls';
import { stripVTControlCharacters } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../logger.js';
import { createProject } from '../project/index.js';
import { startDevServer, type RunningDevServer } from '../server/index.js';
import { COMPILE_FIXTURE, fakeExternals } from '../testing/compileKit.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { createFakePage, type FakeNode, type FakePage } from '../testing/fakePage.js';
import { BROWSER_ERRORS_PATH } from '../featureApi/index.js';

const projectRequire = createRequire(import.meta.url);
const COMPONENT = 'src/webparts/first/components/First.tsx';
const FIRST = (body: string): string =>
  "import * as React from 'react';\n" +
  'export function First(): unknown {\n' +
  '  return <section />;\n' +
  '}\n' +
  'export function explode(): never {\n' +
  `  ${body}\n` +
  '}\n';

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

describe('compile errors and browser errors with a dev server and a page with two bundles', () => {
  let root: string;
  let server: RunningDevServer;
  let page: FakePage;
  const messages: string[] = [];
  const overlays = (): FakeNode[] => page.body.childNodes.filter((node) => node.id === 'fast-serve-error-overlay');

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-browser-errors-'));
    cpSync(COMPILE_FIXTURE, root, { recursive: true });
    mkdirSync(path.join(root, 'node_modules', '@microsoft'), { recursive: true });
    symlinkSync(path.dirname(projectRequire.resolve('@microsoft/sp-css-loader/package.json')), path.join(root, 'node_modules', '@microsoft', 'sp-css-loader'), 'dir');
    mkdirSync(path.join(root, 'src/webparts/first/components'), { recursive: true });
    writeFileSync(path.join(root, COMPONENT), FIRST("throw new Error('exploded');"));
    writeFileSync(
      path.join(root, 'src/webparts/first/FirstWebPart.ts'),
      "import { Version } from '@microsoft/sp-core-library';\nimport { explode } from './components/First';\n" +
        "(globalThis as unknown as Record<string, unknown>).explode = explode;\nexport default class FirstWebPart {\n  public readonly version: Version = Version.parse('1.0');\n}\n",
    );
    const certificate = selfSignedCertificate(root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${stripVTControlCharacters(message)}`),
      warn: (message) => messages.push(`warn: ${stripVTControlCharacters(message)}`),
      error: (message) => messages.push(`error: ${stripVTControlCharacters(message)}`),
    };
    const project = createProject(root, logger);
    const options = resolveOptions({ cli: { port: await freePort() }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root, project, options }, logger, https: certificate, outputPath: path.join(root, 'out') });
    page = createFakePage({ externals: fakeExternals, fetch: (url, init) => fetch(url, init) });
    const manifests = await (await fetch(`${server.origin}/temp/build/manifests.js`)).text();
    page.loadAmdBundle(manifests);
    const urls = ['single-web-part', 'shared-bundle'].map((bundle) => `${server.origin}/dist/${bundle}.js`);
    const sources = await Promise.all(urls.map(async (url) => (await fetch(url)).text()));
    sources.forEach((source, index) => page.loadAmdBundle(source, urls[index]));
    await delay(1000);
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  it('prints a source-mapped runtime error from project code once and answers with overlay content', async () => {
    page.evaluate('try { explode(); } catch (error) { window.dispatchEvent({ type: "error", error }); }');
    await waitFor(() => messages.some((message) => message.startsWith('error: [Unhandled error]')), 'the forwarded error');
    await waitFor(() => overlays().length === 1, 'the runtime error overlay');
    const reported = messages.filter((message) => message.startsWith('error: [Unhandled error]'));
    expect(reported).toHaveLength(1);
    expect(reported[0]?.split('\n').slice(0, 2)).toEqual(['error: [Unhandled error] Error: exploded', ` > explode ${COMPONENT}:6`]);
    expect(reported[0]).toContain("> 6 |   throw new Error('exploded');");
    expect(overlays()[0]?.shadowRoot?.text).toContain(`${COMPONENT}:6`);
    page.dispatch('keydown', { key: 'Escape' });
  }, 30_000);

  it('drops reports without a project frame', async () => {
    const response = await fetch(`${server.origin}${BROWSER_ERRORS_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ kind: 'error', name: 'Error', message: 'sp', stack: 'Error: sp\n    at https://res-1.cdn.office.net/files/sp-pages.js:1:2', callStack: '' }),
    });
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({});
  });

  it('prints a syntax error with its project path, shows one overlay for both bundles and clears it after the fix', async () => {
    messages.length = 0;
    writeFileSync(path.join(root, COMPONENT), FIRST("throw new Error('exploded'"));
    await waitFor(() => overlays().length > 0, 'the compile error overlay');
    await delay(300);
    expect(overlays()).toHaveLength(1);
    expect(overlays()[0]?.shadowRoot?.text).toContain('[fast-serve] Compile error');
    expect(messages.find((message) => message.startsWith('error:'))?.split('\n')[0]).toBe(`error: error in ${COMPONENT}`);
    expect(messages).toContainEqual(expect.stringMatching(new RegExp(`^info: rebuilt in \\d+ ms \\(${COMPONENT}\\): 1 error$`)));
    writeFileSync(path.join(root, COMPONENT), FIRST("throw new Error('fixed');"));
    await waitFor(() => overlays().length === 0, 'the overlay to close');
    await waitFor(() => messages.some((message) => new RegExp(`^info: rebuilt in \\d+ ms \\(${COMPONENT}\\)$`).test(message)), 'the clean rebuild line');
  }, 30_000);

  it('closes a runtime error overlay after the rebuild that follows an edit and opens it again when the error repeats', async () => {
    const explode = 'try { explode(); } catch (error) { window.dispatchEvent({ type: "error", error }); }';
    page.evaluate(explode);
    await waitFor(() => overlays().length === 1, 'the runtime error overlay');
    writeFileSync(path.join(root, COMPONENT), FIRST("throw new Error('edited');"));
    await waitFor(() => overlays().length === 0, 'the runtime error overlay to close after the rebuild');
    page.evaluate(explode);
    await waitFor(() => overlays().length === 1, 'the runtime error overlay to open again');
    expect(overlays()[0]?.shadowRoot?.text).toContain('[fast-serve] Uncaught runtime error');
    page.dispatch('keydown', { key: 'Escape' });
  }, 30_000);
});
