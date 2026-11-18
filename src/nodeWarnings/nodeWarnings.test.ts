import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { transformWithOxc } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { hideHttp2StatusMessageWarning, isHttp2StatusMessageWarning } from './index.js';

const STATUS_MESSAGE = 'Status message is not supported by HTTP/2 (RFC7540 8.1.2.4)';
const TRACE_HINT = '(Use `node --trace-warnings ...` to show where the warning was created)';
const OTHER_WARNINGS = [
  '(node:PID) UnsupportedWarning: Another feature is not supported',
  '(node:PID) [DEP9999] DeprecationWarning: Old API',
  '(node:PID) [X1] CustomWarning: Custom warning',
  'Some detail',
  '',
].join('\n');

describe('isHttp2StatusMessageWarning', () => {
  it('matches the HTTP/2 status message warning in every emitWarning form', () => {
    expect(isHttp2StatusMessageWarning(STATUS_MESSAGE, 'UnsupportedWarning')).toBe(true);
    expect(isHttp2StatusMessageWarning(STATUS_MESSAGE, { type: 'UnsupportedWarning' })).toBe(true);
    expect(isHttp2StatusMessageWarning(Object.assign(new Error(STATUS_MESSAGE), { name: 'UnsupportedWarning' }))).toBe(true);
  });

  it('keeps other warnings', () => {
    expect(isHttp2StatusMessageWarning('Something else is not supported', 'UnsupportedWarning')).toBe(false);
    expect(isHttp2StatusMessageWarning(STATUS_MESSAGE, 'DeprecationWarning')).toBe(false);
    expect(isHttp2StatusMessageWarning(STATUS_MESSAGE)).toBe(false);
    expect(isHttp2StatusMessageWarning(new Error(STATUS_MESSAGE))).toBe(false);
  });
});

describe('hideHttp2StatusMessageWarning', () => {
  it('forwards every other call with its arguments and receiver', () => {
    const emitWarning = vi.fn<(...args: unknown[]) => void>();
    const target = { emitWarning: emitWarning as typeof process.emitWarning };
    hideHttp2StatusMessageWarning(target);

    target.emitWarning(STATUS_MESSAGE, 'UnsupportedWarning');
    target.emitWarning('Old API', 'DeprecationWarning', 'DEP9999');
    target.emitWarning('Custom', { type: 'CustomWarning', code: 'X1', detail: 'details' });

    expect(emitWarning.mock.calls).toEqual([
      ['Old API', 'DeprecationWarning', 'DEP9999'],
      ['Custom', { type: 'CustomWarning', code: 'X1', detail: 'details' }],
    ]);
    expect(emitWarning.mock.contexts).toEqual([target, target]);
  });
});

const scenario = (moduleUrl: string) => `
import http2 from 'node:http2';
if (process.env.FILTER === '1') (await import(${JSON.stringify(moduleUrl)})).hideHttp2StatusMessageWarning();
const server = http2.createServer((request, response) => {
  response.writeHead(504, 'Outdated Optimize Dep');
  response.end();
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const client = http2.connect('http://127.0.0.1:' + server.address().port);
const request = client.request({ ':path': '/' });
request.resume();
await new Promise((resolve) => request.on('close', resolve));
client.close();
server.close();
process.emitWarning('Another feature is not supported', 'UnsupportedWarning');
process.emitWarning('Old API', 'DeprecationWarning', 'DEP9999');
process.emitWarning('Custom warning', { type: 'CustomWarning', code: 'X1', detail: 'Some detail' });
await new Promise((resolve) => setTimeout(resolve, 50));
`;

describe('in a Node process', () => {
  let dir: string;
  let script: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'fast-serve-node-warnings-'));
    const source = fileURLToPath(new URL('./index.ts', import.meta.url));
    const compiled = await transformWithOxc(readFileSync(source, 'utf8'), source, { lang: 'ts' });
    const moduleFile = join(dir, 'nodeWarnings.mjs');
    writeFileSync(moduleFile, compiled.code);
    script = join(dir, 'scenario.mjs');
    writeFileSync(script, scenario(pathToFileURL(moduleFile).href));
  });

  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  async function stderr(filter: boolean, nodeArgs: string[] = []) {
    const { stderr: output } = await promisify(execFile)(process.execPath, [...nodeArgs, script], {
      env: { ...process.env, FILTER: filter ? '1' : '0', NODE_NO_WARNINGS: '' },
    });
    return output.replaceAll(/\(node:\d+\)/g, '(node:PID)');
  }

  it('drops only the HTTP/2 status message warning and prints the rest exactly as Node does', async () => {
    const [unfiltered, filtered] = await Promise.all([stderr(false), stderr(true)]);
    expect(unfiltered).toContain(STATUS_MESSAGE);
    expect(filtered).not.toContain(STATUS_MESSAGE);
    expect(unfiltered).toBe(`(node:PID) UnsupportedWarning: ${STATUS_MESSAGE}\n${TRACE_HINT}\n${OTHER_WARNINGS}`);
    expect(filtered).toBe(`(node:PID) UnsupportedWarning: Another feature is not supported\n${TRACE_HINT}\n${OTHER_WARNINGS.split('\n').slice(1).join('\n')}`);
  });

  it('keeps --trace-warnings stacks identical', async () => {
    const [unfiltered, filtered] = await Promise.all([stderr(false, ['--trace-warnings']), stderr(true, ['--trace-warnings'])]);
    expect(filtered).toContain(`at file://${script}`);
    expect(filtered).not.toContain('filteredEmitWarning');
    expect(filtered).toBe(unfiltered.slice(unfiltered.indexOf('(node:PID) UnsupportedWarning: Another feature')));
  });

  it('respects --no-warnings and --disable-warning', async () => {
    expect(await stderr(true, ['--no-warnings'])).toBe('');
    const output = await stderr(true, ['--disable-warning=DeprecationWarning']);
    expect(output).not.toContain('DeprecationWarning');
    expect(output).toContain('CustomWarning');
  });
});
