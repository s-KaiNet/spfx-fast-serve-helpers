import { describe, expect, it, vi } from 'vitest';
import type { FastServeOptions } from '../config/options.js';
import { packageVersion } from '../shared/packageInfo.js';
import { runCli } from './runCli.js';

async function run(args: string[], startServer = vi.fn<(options: FastServeOptions) => Promise<void>>()) {
  let out = '';
  let err = '';
  const code = await runCli(args, { out: (t) => (out += t), err: (t) => (err += t), startServer });
  return { code, out, err, startServer };
}

describe('runCli', () => {
  it('prints the version', async () => {
    expect(await run(['--version'])).toMatchObject({ code: 0, out: `${packageVersion}\n`, err: '' });
  });

  it('prints help', async () => {
    const result = await run(['--help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Usage: fast-serve');
    expect(result.out).toContain('Rspack dev server');
    expect(result.out).toContain('--no-overlay');
    expect(result.out).toContain('--no-type-check');
    expect(result.out).not.toContain('--type-check-overlay');
    expect(result.out).toContain('--lint [full]');
    expect(result.out).toContain('--no-lint');
    expect(result.out).toContain('"$schema": "../node_modules/spfx-fast-serve-helpers/schema/config.schema.json"');
    expect(result.out).not.toMatch(/vite/i);
    expect(result.startServer).not.toHaveBeenCalled();
  });

  it('uses a 1.24 release or beta version', () => {
    expect(packageVersion).toMatch(/^1\.24\.\d+(-beta\.\d+)?$/);
  });

  it('fails on unknown options', async () => {
    const result = await run(['--nope']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('--nope');
    expect(result.err).toContain('Usage: fast-serve');
    expect(result.startServer).not.toHaveBeenCalled();
  });

  it('starts the server with zero config', async () => {
    const result = await run([]);
    expect(result.code).toBe(0);
    expect(result.startServer).toHaveBeenCalledWith({});
  });

  it('passes options from flags', async () => {
    const result = await run(['-p', '4400', '--page-url', 'https://t/p.aspx', '--locale', 'de-de']);
    expect(result.startServer).toHaveBeenCalledWith({ port: 4400, pageUrl: 'https://t/p.aspx', locale: 'de-de' });
  });

  it('selects a serve configuration with --config or --serve-config', async () => {
    expect((await run(['--config', 'rating'])).startServer).toHaveBeenCalledWith({ serveConfiguration: 'rating' });
    expect((await run(['--serve-config', 'banner'])).startServer).toHaveBeenCalledWith({ serveConfiguration: 'banner' });
  });

  it('turns the error overlay off with --no-overlay', async () => {
    expect((await run(['--no-overlay'])).startServer).toHaveBeenCalledWith({ overlay: false });
  });

  it('turns type checking on or off with flags', async () => {
    expect((await run(['--type-check'])).startServer).toHaveBeenCalledWith({ typeCheck: true });
    expect((await run(['--no-type-check'])).startServer).toHaveBeenCalledWith({ typeCheck: false });
    const removed = await run(['--no-type-check-overlay']);
    expect(removed.startServer).not.toHaveBeenCalled();
    const both = await run(['--type-check', '--no-type-check']);
    expect(both.startServer).not.toHaveBeenCalled();
    expect(both.err).toContain('either --type-check or --no-type-check');
  });

  it('turns linting on, full or off with flags', async () => {
    expect((await run(['--lint'])).startServer).toHaveBeenCalledWith({ lint: true });
    expect((await run(['--lint', 'full'])).startServer).toHaveBeenCalledWith({ lint: 'full' });
    expect((await run(['--lint=full', '--port', '4400'])).startServer).toHaveBeenCalledWith({ lint: 'full', port: 4400 });
    expect((await run(['--lint', '--port', '4400'])).startServer).toHaveBeenCalledWith({ lint: true, port: 4400 });
    expect((await run(['--no-lint'])).startServer).toHaveBeenCalledWith({ lint: false });
    const both = await run(['--lint', '--no-lint']);
    expect(both.startServer).not.toHaveBeenCalled();
    expect(both.err).toContain('either --lint or --no-lint');
    const wrong = await run(['--lint=fast']);
    expect(wrong.startServer).not.toHaveBeenCalled();
    expect(wrong.err).toContain('Invalid --lint value "fast"');
  });

  it('reports start errors', async () => {
    const result = await run([], vi.fn().mockRejectedValue(new Error('boom')));
    expect(result).toMatchObject({ code: 1, err: '[fast-serve] boom\n' });
    expect(await run(['--port', 'x'])).toMatchObject({ code: 1, err: '[fast-serve] Invalid port "x" (expected 1-65535)\n' });
    expect((await run(['-p', '0'])).err).toContain('Invalid port "0"');
  });
});
