import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../shared/logger.js';
import { createProject } from '../project/index.js';
import { startDevServer } from '../server/index.js';
import { startDevSession, type DevSession } from '../session/index.js';
import { copyCompileFixture, packageDirectory, type FixtureCopy } from '../testing/compileKit.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { TS_BUILD_INFO_FILE } from './checkerOptions.js';

const HELLO = 'src/webparts/hello/components/Hello.tsx';
const HELLO_PROPS = 'src/webparts/hello/components/IHelloProps.ts';
const FIRST = 'src/webparts/first/FirstWebPart.ts';
const HEFT_PACKAGES = ['@rushstack/heft-config-file', '@rushstack/rig-package', '@rushstack/heft-static-asset-typings-plugin'];

const TSCONFIG = {
  compilerOptions: {
    target: 'es2017',
    module: 'esnext',
    moduleResolution: 'node',
    jsx: 'react',
    strict: true,
    skipLibCheck: true,
    resolveJsonModule: true,
    esModuleInterop: true,
    types: [],
    lib: ['dom', 'es2017'],
    rootDirs: ['src', 'temp/static-asset-ts'],
    outDir: 'lib',
  },
  include: ['src/**/*.ts', 'src/**/*.tsx'],
};

const DECLARATIONS = `declare module '@microsoft/sp-core-library' { export class Version { static parse(value: string): Version; } }
declare module '@microsoft/sp-webpart-base' { export class BaseClientSideWebPart { readonly context: unknown; } }
declare module '@microsoft/microsoft-graph-client' { export class GraphClient {} }
declare module 'HelloWebPartStrings' { export const Title: string; }
declare module 'nested-react-user' { export function nestedReactVersion(): string; }
declare module 'react';
declare namespace JSX { interface IntrinsicElements { [name: string]: unknown } }
declare const process: { env: Record<string, string | undefined> };
`;

function typeCheckFixture(): FixtureCopy {
  const fixture = copyCompileFixture({
    'tsconfig.json': TSCONFIG,
    'src/declarations.d.ts': DECLARATIONS,
    'config/static-asset-typings.json': { fileExtensions: ['.png'], generatedTsFolders: ['temp/static-asset-ts'] },
  });
  for (const name of HEFT_PACKAGES) fixture.linkPackage(name);
  fixture.linkLocalPackage('typescript', packageDirectory('typescript-5'));
  return fixture;
}

function recordingLogger(messages: string[]): Logger {
  return {
    info: (message) => messages.push(`info: ${message}`),
    warn: (message) => messages.push(`warn: ${message}`),
    error: (message) => messages.push(`error: ${message}`),
  };
}

function checkerWorkers(): string[] {
  const listing = execFileSync('ps', ['-o', 'pid=,args=', '--ppid', String(process.pid)], { encoding: 'utf8' });
  return listing.split('\n').filter((line) => line.includes('ts-checker-rspack-plugin'));
}

function poll(condition: () => boolean, describeFailure: () => string, timeoutMs = 30_000): Promise<void> {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      if (condition()) resolve();
      else if (Date.now() - startedAt > timeoutMs) reject(new Error(describeFailure()));
      else setTimeout(check, 25);
    };
    check();
  });
}

interface EventStream {
  events: unknown[];
  close(): void;
}

function openEventStream(url: string): Promise<EventStream> {
  return new Promise((resolve, reject) => {
    const events: unknown[] = [];
    let buffered = '';
    const req = request(url, { rejectUnauthorized: false }, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffered += chunk;
        const messages = buffered.split('\n\n');
        buffered = messages.pop() ?? '';
        for (const message of messages) {
          const data = message.split('\n').find((line) => line.startsWith('data: '));
          if (data !== undefined) events.push(JSON.parse(data.slice('data: '.length)));
        }
      });
      resolve({
        events,
        close: () => {
          req.destroy();
        },
      });
    });
    req.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ECONNRESET') reject(error);
    });
    req.end();
  });
}

function getText(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = request(url, { rejectUnauthorized: false }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
    });
    req.on('error', reject);
    req.end();
  });
}

describe('background type check with the project TypeScript', { timeout: 60_000 }, () => {
  let fixture: FixtureCopy;
  let session: DevSession;
  let stream: EventStream | undefined;
  const messages: string[] = [];
  const summaries = (from = 0) => messages.slice(from).filter((message) => /^(info|error): type check: /.test(message));
  const lastSummary = () => summaries().at(-1);

  const waitForSummary = async (pattern: RegExp, from: number) => {
    await poll(
      () => summaries(from).some((summary) => pattern.test(summary)),
      () => `timed out waiting for ${String(pattern)}\n${messages.slice(from).join('\n')}`,
    );
  };

  beforeAll(async () => {
    fixture = typeCheckFixture();
    fixture.write('fast-serve/config.json', { typeCheck: true, typeCheckOverlay: true });
    session = await startDevSession({
      root: fixture.root,
      cli: { port: await freePort() },
      logger: recordingLogger(messages),
      onRestartFailed: (error) => {
        messages.push(`restart failed: ${String(error)}`);
      },
      env: {},
      https: selfSignedCertificate(fixture.root),
      outputPath: path.join(fixture.root, 'out'),
      settleMs: 50,
    });
  }, 60_000);

  afterAll(async () => {
    stream?.close();
    await session.close();
    await poll(
      () => checkerWorkers().length === 0,
      () => `checker workers left after close:\n${checkerWorkers().join('\n')}`,
      5000,
    );
    fixture.remove();
  });

  it('reports a clean project once the first compile and the generated typings are done', async () => {
    await waitForSummary(/type check: no errors$/, 0);
    expect(lastSummary()).toBe('info: type check: no errors');
    expect(existsSync(path.join(fixture.root, 'temp/static-asset-ts/webparts/hello/assets/logo.png.d.ts'))).toBe(true);
    expect(checkerWorkers()).toHaveLength(2);
    stream = await openEventStream(`${session.origin}/fast-serve/type-check`);
    await poll(
      () => stream?.events.length === 1,
      () => 'no initial overlay event',
    );
    expect(stream.events).toEqual([null]);
    expect(await getText(`${session.origin}/temp/build/manifests.js`)).toContain('installTypeCheckOverlay');
  });

  it('reports a planted error once, never as a compile error, and the fix as "no errors"', async () => {
    const source = fixture.read(HELLO);
    const from = messages.length;
    fixture.write(HELLO, source.replace('{nestedReactVersion()}', '{(escape1 as string)}{nestedReactVersion()}'));
    await waitForSummary(/type check: 1 error$/, from);
    const block = messages.slice(from).find((message) => message.startsWith('error: type error in '));
    expect(block).toMatch(new RegExp(`^error: type error in ${HELLO}:6:\\d+\\nTS2552: Cannot find name 'escape1'`));
    expect(block).toContain('> 6 |');
    expect(messages.slice(from).filter((message) => message.includes('rebuilt in'))).toEqual([expect.stringMatching(/rebuilt in \d+ ms \(src\/webparts\/hello\/components\/Hello\.tsx\)$/)]);
    await poll(
      () => stream?.events.length === 2,
      () => 'no overlay event for the error',
    );
    expect(stream?.events[1]).toMatchObject({ title: 'Type check: 1 error', text: expect.stringContaining("TS2552: Cannot find name 'escape1'") as unknown });

    const unrelated = messages.length;
    fixture.write(FIRST, `${fixture.read(FIRST)}\nexport const contosoMarker = 1;\n`);
    await poll(
      () => messages.slice(unrelated).some((message) => message.includes('rebuilt in')),
      () => 'no rebuild for the unrelated edit',
    );
    await delay(1500);
    expect(summaries(unrelated)).toEqual([]);

    const fixed = messages.length;
    fixture.write(HELLO, source);
    await waitForSummary(/type check: no errors$/, fixed);
    await poll(
      () => stream?.events.at(-1) === null && stream.events.length === 3,
      () => 'no overlay event for the fix',
    );
  });

  it('leaves syntax errors in compiled files to the compiler and still reports semantic errors', async () => {
    const hello = fixture.read(HELLO);
    const first = fixture.read(FIRST);
    const from = messages.length;
    fixture.write(HELLO, hello.replace('{nestedReactVersion()}', '{nestedReactVersion()'));
    fixture.write(FIRST, `${first}\nexport const contosoTypo: string = escape1;\n`);
    await waitForSummary(/type check: 1 error$/, from);
    await delay(500);
    const reported = messages.slice(from);
    expect(reported.some((message) => message.startsWith('error: ') && message.includes(HELLO) && !message.startsWith('error: type '))).toBe(true);
    expect(reported.some((message) => message.startsWith('error: type error in ') && message.includes(FIRST) && message.includes("Cannot find name 'escape1'"))).toBe(true);
    expect(reported.filter((message) => message.startsWith('error: type error in ') && message.includes(HELLO))).toEqual([]);
    expect(summaries(from).filter((summary) => summary !== 'error: type check: 1 error')).toEqual([]);
    const fixed = messages.length;
    fixture.write(HELLO, hello);
    fixture.write(FIRST, first);
    await waitForSummary(/type check: no errors$/, fixed);
    expect(summaries(fixed)).toEqual(['info: type check: no errors']);
  });

  it('reports a syntax error in a type-only file, which the compiler never sees', async () => {
    const source = fixture.read(HELLO_PROPS);
    const from = messages.length;
    fixture.write(HELLO_PROPS, source.replace('title: string;', 'title: string;;\n  = 3'));
    await waitForSummary(/type check: \d+ errors?$/, from);
    expect(messages.slice(from).some((message) => message.startsWith('error: type error in ') && message.includes(HELLO_PROPS) && /TS1\d{3}:/.test(message))).toBe(true);
    const fixed = messages.length;
    fixture.write(HELLO_PROPS, source);
    await waitForSummary(/type check: no errors$/, fixed);
  });

  it('re-checks a type-only file save without a "rebuilt" line', async () => {
    const source = fixture.read(HELLO_PROPS);
    const from = messages.length;
    fixture.write(HELLO_PROPS, source.replace('title: string;', 'title: string;\n  subtitle: string;'));
    await waitForSummary(/type check: \d+ errors?$/, from);
    expect(messages.slice(from).some((message) => message.includes("Property 'subtitle' is missing"))).toBe(true);
    const fixed = messages.length;
    fixture.write(HELLO_PROPS, source);
    await waitForSummary(/type check: no errors$/, fixed);
    expect(messages.slice(from).filter((message) => message.includes('rebuilt'))).toEqual([]);
  });

  it('clears "cannot find module" once fast-serve writes the typings of a new asset', async () => {
    const webPart = 'src/webparts/hello/HelloWebPart.ts';
    const source = fixture.read(webPart);
    const from = messages.length;
    fixture.write(webPart, `import banner from './assets/banner.png';\n${source}\nexport const bannerUrl: string = banner;\n`);
    await waitForSummary(/type check: 1 error$/, from);
    expect(messages.slice(from).some((message) => message.includes("TS2307: Cannot find module './assets/banner.png'"))).toBe(true);
    const added = messages.length;
    writeFileSync(path.join(fixture.root, 'src/webparts/hello/assets/banner.png'), readFileSync(path.join(fixture.root, 'src/webparts/hello/assets/logo.png')));
    await waitForSummary(/type check: no errors$/, added);
    fixture.write(webPart, source);
  });

  it('checks again after a restart, warm from the build info file, with the same number of workers', async () => {
    expect(existsSync(path.join(fixture.root, TS_BUILD_INFO_FILE))).toBe(true);
    const from = messages.length;
    fixture.write('fast-serve/config.json', { typeCheck: true, typeCheckOverlay: true, locale: 'en-us' });
    await poll(
      () => messages.slice(from).some((message) => message.includes('restarted in')),
      () => `no restart\n${messages.slice(from).join('\n')}`,
    );
    await waitForSummary(/type check: no errors$/, from);
    expect(session.restarts).toBe(1);
    await poll(
      () => checkerWorkers().length === 2,
      () => `expected 2 checker workers:\n${checkerWorkers().join('\n')}`,
      5000,
    );
  });
});

describe('a type checker from the extend file', () => {
  it('replaces fast-serve type check', async () => {
    const fixture = typeCheckFixture();
    const messages: string[] = [];
    const logger = recordingLogger(messages);
    const project = createProject(fixture.root, logger);
    const options = resolveOptions({ cli: { port: await freePort(), typeCheck: true }, defaults: project.serveConfig() }, {});
    class TsCheckerRspackPlugin {
      readonly applied: string[] = [];
      apply(): void {
        this.applied.push('applied');
      }
    }
    const theirs = new TsCheckerRspackPlugin();
    const server = await startDevServer({
      setup: { root: fixture.root, project, options },
      logger,
      https: selfSignedCertificate(fixture.root),
      outputPath: path.join(fixture.root, 'out'),
      persistentCache: false,
      extend: { file: path.join(fixture.root, 'fast-serve/rspack.extend.mjs'), config: { plugins: [theirs] }, dependencies: [] },
    });
    try {
      expect(theirs.applied).toEqual(['applied']);
      expect(messages).toContain("info: type check: using the TsCheckerRspackPlugin from the Rspack extend file (fast-serve's own type check is skipped)");
      expect(checkerWorkers()).toEqual([]);
    } finally {
      await server.close();
      fixture.remove();
    }
  }, 30_000);
});
