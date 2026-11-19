import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createProject } from '../project/index.js';
import { restartReason, restartTriggers } from './restartTriggers.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/externals', import.meta.url));
let root: string;

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'fast-serve-triggers-'));
  cpSync(fixture, root, { recursive: true });
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('restartTriggers', () => {
  it('watches the project configuration, manifests, extend files and their imports, but not local-file externals', () => {
    const project = createProject(root, { warn: () => undefined });
    const extendFile = path.join(root, 'fast-serve/rspack.extend.mjs');
    const helper = path.join(root, 'scripts/helpers.mjs');
    const { files } = restartTriggers(project, extendFile, [extendFile, helper]);
    const relative = files.map((file) => path.relative(root, file).split(path.sep).join('/'));
    expect(relative).toEqual(
      expect.arrayContaining([
        'package.json',
        'config/config.json',
        'config/serve.json',
        'config/sass.json',
        'fast-serve/config.json',
        'fast-serve/rspack.extend.mjs',
        'fast-serve/rspack.extend.mts',
        'fast-serve/rspack.extend.cjs',
        'scripts/helpers.mjs',
      ]),
    );
    expect(relative.some((file) => file.endsWith('.manifest.json'))).toBe(true);
    const localExternals = [...project.configExternals().values()].flatMap(({ source }) => (source.type === 'file' ? [source.file] : []));
    expect(localExternals.length).toBeGreaterThan(0);
    for (const file of localExternals) expect(files).not.toContain(path.resolve(file));
  });

  it('describes why fast-serve restarts', () => {
    const project = createProject(root, { warn: () => undefined });
    const extendFile = path.join(root, 'fast-serve/rspack.extend.mjs');
    const triggers = restartTriggers(project, extendFile, [path.join(root, 'scripts/helpers.mjs')]);
    expect(restartReason(triggers, [{ file: path.join(root, 'config/sass.json'), exists: true }])).toBe('config/sass.json changed, restarting fast-serve');
    expect(restartReason(triggers, [{ file: extendFile, exists: false }])).toBe('fast-serve/rspack.extend.mjs was removed, restarting fast-serve');
    expect(restartReason(triggers, [{ file: path.join(root, 'fast-serve/rspack.extend.mts'), exists: true }])).toBe('fast-serve/rspack.extend.mts found, restarting fast-serve');
    expect(restartReason(triggers, [{ file: path.join(root, 'scripts/helpers.mjs'), exists: true }, { file: path.join(root, 'package.json'), exists: true }])).toBe(
      'scripts/helpers.mjs (imported by fast-serve/rspack.extend.mjs) changed (+1 more), restarting fast-serve',
    );
  });
});
