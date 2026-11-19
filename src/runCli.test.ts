import { describe, expect, it } from 'vitest';
import { packageVersion } from './packageInfo.js';
import { notImplementedText, runCli } from './runCli.js';

function run(args: string[]) {
  let out = '';
  let err = '';
  const code = runCli(args, { out: (text) => (out += text), err: (text) => (err += text) });
  return { code, out, err };
}

describe('runCli', () => {
  it('prints the version', () => {
    expect(run(['--version'])).toEqual({ code: 0, out: `${packageVersion}\n`, err: '' });
    expect(run(['-v']).out).toBe(`${packageVersion}\n`);
  });

  it('prints help', () => {
    const result = run(['--help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Usage: fast-serve');
    expect(result.out).toContain('Rspack');
  });

  it('fails on unknown options with the help text', () => {
    const result = run(['--nope']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('--nope');
    expect(result.err).toContain('Usage: fast-serve');
  });

  it('reports that serving is not implemented yet', () => {
    expect(run([])).toEqual({ code: 1, out: '', err: notImplementedText });
  });

  it('uses an Rspack prerelease version', () => {
    expect(packageVersion).toMatch(/^1\.24\.0-rspack\.\d+$/);
  });
});
