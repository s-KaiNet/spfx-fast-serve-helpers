import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { sassPreprocessorOptions } from '../styles/index.js';
import { createProject } from './project.js';
import type { SassConfiguration } from './sassConfiguration.js';

const workspace = fileURLToPath(new URL('../../node_modules/.cache/fast-serve-tests/', import.meta.url));
const RIG_DEPRECATIONS = ['mixed-decls', 'import', 'global-builtin', 'color-functions'];
const RIG_SASS_JSON = 'node_modules/test-rig/profiles/default/config/sass.json';

const silencedBy = ({ silenceDeprecations }: SassConfiguration) => silenceDeprecations && [...silenceDeprecations];

const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function projectWith(files: Record<string, unknown>) {
  mkdirSync(workspace, { recursive: true });
  const root = mkdtempSync(path.join(workspace, 'sass-config-'));
  createdRoots.push(root);
  const allFiles: Record<string, unknown> = { 'package.json': { name: 'sass-config-fixture', version: '1.0.0' }, ...files };
  for (const [file, content] of Object.entries(allFiles)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), JSON.stringify(content));
  }
  const warnings: string[] = [];
  return { root, warnings, project: createProject(root, { warn: (message) => warnings.push(message) }) };
}

const withRig = {
  'config/rig.json': { rigPackageName: 'test-rig' },
  'node_modules/test-rig/package.json': { name: 'test-rig', version: '1.0.0' },
  [RIG_SASS_JSON]: { fileExtensions: ['.scss'], silenceDeprecations: RIG_DEPRECATIONS },
};

describe('project Sass configuration', () => {
  it('appends silenceDeprecations of the project config to the extended rig config, like heft', async () => {
    const { project } = projectWith({
      ...withRig,
      'config/sass.json': { extends: 'test-rig/profiles/default/config/sass.json', silenceDeprecations: ['slash-div'] },
    });

    const configuration = await project.sassConfiguration();

    expect(silencedBy(configuration)).toEqual([...RIG_DEPRECATIONS, 'slash-div']);
    expect(sassPreprocessorOptions(configuration)).toEqual({
      scss: { silenceDeprecations: [...RIG_DEPRECATIONS, 'slash-div'] },
      sass: { silenceDeprecations: [...RIG_DEPRECATIONS, 'slash-div'] },
    });
  });

  it('uses the rig config when the project has no config/sass.json', async () => {
    const { project } = projectWith(withRig);

    expect(silencedBy(await project.sassConfiguration())).toEqual(RIG_DEPRECATIONS);
  });

  it('sets no preprocessor options without a config or without silenceDeprecations', async () => {
    const withoutConfig = projectWith({}).project;
    const withoutField = projectWith({ 'config/sass.json': { excludeFiles: ['legacy/**'] } }).project;

    expect(await withoutConfig.sassConfiguration()).toEqual({});
    expect(sassPreprocessorOptions(await withoutConfig.sassConfiguration())).toBeUndefined();
    expect(sassPreprocessorOptions(await withoutField.sassConfiguration())).toBeUndefined();
  });

  it('reads config/sass.json again after it changes and reports it as a sass change', async () => {
    const { root, project } = projectWith({ 'config/sass.json': { silenceDeprecations: ['import'] } });
    const sassJson = path.join(root, 'config/sass.json');
    expect(silencedBy(await project.sassConfiguration())).toEqual(['import']);

    writeFileSync(sassJson, JSON.stringify({ silenceDeprecations: ['slash-div'] }));

    expect(project.invalidate(sassJson)).toBe('sass');
    expect(silencedBy(await project.sassConfiguration())).toEqual(['slash-div']);
  });

  it('rejects an invalid config/sass.json', async () => {
    const { project } = projectWith({ 'config/sass.json': { silenceDeprecations: 'import' } });

    await expect(project.sassConfiguration()).rejects.toThrow(/sass\.json/);
  });
});
