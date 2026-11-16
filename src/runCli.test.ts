import { describe, expect, it } from 'vitest';
import { packageVersion } from './packageInfo.js';
import { runCli } from './runCli.js';

function run(args: string[]) {
  let out = '';
  let err = '';
  const code = runCli(args, { out: (t) => (out += t), err: (t) => (err += t) });
  return { code, out, err };
}

describe('runCli', () => {
  it('prints the version', () => {
    expect(run(['--version'])).toEqual({ code: 0, out: `${packageVersion}\n`, err: '' });
  });

  it('prints help', () => {
    const result = run(['--help']);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Usage: fast-serve');
  });

  it('fails on unknown options', () => {
    const result = run(['--nope']);
    expect(result.code).toBe(1);
    expect(result.err).toContain('--nope');
  });
});
