import { cpSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDevServer } from './devServer.js';

vi.mock('./server/certificate.js', () => ({ loadDevCertificate: () => Promise.resolve({ cert: 'test-cert', key: 'test-key' }) }));

const fixture = fileURLToPath(new URL('../test/fixtures/basic', import.meta.url));
let projectRoot: string | undefined;

afterEach(() => {
  if (projectRoot) rmSync(projectRoot, { recursive: true, force: true });
  projectRoot = undefined;
});

function projectWith(files: Record<string, string>): string {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'fast-serve-dev-server-'));
  cpSync(fixture, projectRoot, { recursive: true, filter: (source) => !source.includes(`${path.sep}node_modules`) });
  symlinkSync(path.join(fixture, 'node_modules'), path.join(projectRoot, 'node_modules'), 'junction');
  for (const [file, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(projectRoot, file)), { recursive: true });
    writeFileSync(path.join(projectRoot, file), content);
  }
  return projectRoot;
}

function recordingLogger() {
  const lines: string[] = [];
  const record = (message: string) => {
    lines.push(message);
  };
  return { lines, logger: { info: record, warn: record, error: record } };
}

describe('startDevServer with fast-serve/vite.extend.*', () => {
  it('names the file when it is broken at startup and skips the webpack hint', async () => {
    const root = projectWith({ 'fast-serve/vite.extend.mts': 'export default {\n', 'config/spfx-customize-webpack.js': 'module.exports = {};' });
    const { lines, logger } = recordingLogger();
    const vite = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(startDevServer({ root, cli: { port: 4931 }, logger })).rejects.toThrow(/^fast-serve\/vite\.extend\.mts could not be loaded: .*\nFix or remove the file and run fast-serve again\.$/s);
    vite.mockRestore();
    expect(lines).toContain('Vite config: fast-serve/vite.extend.mts');
    expect(lines.some((line) => line.startsWith('hint:'))).toBe(false);
  });

  it('tells to move config/fast-serve.json to fast-serve/config.json', async () => {
    const root = projectWith({ 'config/fast-serve.json': '{ "port": 4932 }', 'fast-serve/vite.extend.mts': 'export default {\n' });
    const { lines, logger } = recordingLogger();
    const vite = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(startDevServer({ root, cli: { port: 4931 }, logger })).rejects.toThrow(/could not be loaded/);
    vite.mockRestore();
    expect(lines).toContain('config/fast-serve.json is not read anymore: move it to fast-serve/config.json (same options)');
  });
});
