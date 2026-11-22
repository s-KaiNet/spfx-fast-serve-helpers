import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import tls from 'node:tls';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../../../config/options.js';
import type { Logger } from '../../../shared/logger.js';
import { createProject } from '../../../project/index.js';
import { startDevServer, type RunningDevServer } from '../../../server/index.js';
import { copyCompileFixture, fakeExternals, type FixtureCopy } from '../../../../test/kit/compileKit.js';
import { freePort, selfSignedCertificate } from '../../../../test/kit/devServerKit.js';
import { createFakePage, type FakePage } from '../../../../test/kit/fakePage.js';

const COMPONENT_PATH = 'src/webparts/hello/components/Greeting.tsx';

const IMPORTS = "import * as React from 'react';\nimport { GraphClient } from '@microsoft/microsoft-graph-client';\nimport { chart } from 'corp-legacy';\n";

const COMPONENT = (label: string): string =>
  IMPORTS +
  `(globalThis as unknown as Record<string, unknown>).greeting = ['${label}', typeof GraphClient, chart].join(' ');\n` +
  'export function Greeting(): unknown {\n  return <div title={String(GraphClient) + chart}><span>Learn more</span></div>;\n}\n';

const BROKEN_COMPONENT = `${IMPORTS}export function Greeting(): unknown {\n  return <div title={String(GraphClient) + chart}><span>Learn more</span</div>;\n}\n`;

const HELLO = "import * as React from 'react';\nimport { Greeting } from './Greeting';\nexport function renderHello(): unknown {\n  return <Greeting />;\n}\n";

async function waitFor(condition: () => boolean, description: string, deadline = Date.now() + 20_000): Promise<void> {
  if (condition()) return;
  if (Date.now() > deadline) throw new Error(`timed out waiting for ${description}`);
  await delay(50);
  await waitFor(condition, description, deadline);
}

describe('AMD externals used only by a component that had a syntax error', () => {
  let fixture: FixtureCopy;
  let server: RunningDevServer;
  let page: FakePage;
  const messages: string[] = [];

  beforeAll(async () => {
    fixture = copyCompileFixture({ [COMPONENT_PATH]: COMPONENT('v1'), 'src/webparts/hello/components/Hello.tsx': HELLO });
    const config = JSON.parse(fixture.read('config/config.json')) as Record<string, unknown>;
    fixture.write('config/config.json', { ...config, externals: { 'corp-legacy': { path: 'https://cdn.contoso.com/corp-legacy.js', globalName: 'CorpLegacy' } } });
    for (const name of ['@microsoft/sp-css-loader', 'sass-embedded']) fixture.linkPackage(name);
    const certificate = selfSignedCertificate(fixture.root);
    tls.setDefaultCACertificates([...tls.getCACertificates('default'), certificate.cert]);
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const project = createProject(fixture.root, logger);
    const port = await freePort();
    const options = resolveOptions({ cli: { typeCheck: false, port }, defaults: project.serveConfig() }, {});
    server = await startDevServer({ setup: { root: fixture.root, project, options }, logger, https: certificate, outputPath: path.join(fixture.root, 'out'), persistentCache: false });
    page = createFakePage({ externals: { ...fakeExternals, 'corp-legacy': { chart: 'legacy-chart' } }, fetch });
    page.loadAmdBundle(await (await fetch(`${server.origin}/dist/single-web-part.js`)).text());
    await waitFor(() => page.globals.greeting === 'v1 function legacy-chart', 'the first render');
  }, 60_000);

  afterAll(async () => {
    await server.close();
    fixture.remove();
  });

  it('keeps the externals bound after the error is fixed and on the next edit, without a reload', async () => {
    fixture.write(COMPONENT_PATH, BROKEN_COMPONENT);
    await waitFor(() => messages.some((message) => message.includes('Expression expected')), 'the syntax error');
    fixture.write(COMPONENT_PATH, COMPONENT('v2'));
    await waitFor(() => page.globals.greeting === 'v2 function legacy-chart', 'the fixed component');
    fixture.write(COMPONENT_PATH, COMPONENT('v3'));
    await waitFor(() => page.globals.greeting === 'v3 function legacy-chart', 'the next edit');
    expect(page.reloads()).toBe(0);
    expect(messages.filter((message) => message.includes('is not defined') || message.includes('is not a function'))).toEqual([]);
  }, 60_000);
});
