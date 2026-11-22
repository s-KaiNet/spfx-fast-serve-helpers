import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readTextIfExists, removeFileIfExists, writeFileIfChanged } from './generatedFiles.js';
import { testWorkspace } from '../../test/kit/paths.js';

const workspace = testWorkspace();
const createdFolders: string[] = [];

afterEach(() => {
  for (const created of createdFolders.splice(0)) rmSync(created, { recursive: true, force: true });
});

function folder(): string {
  mkdirSync(workspace, { recursive: true });
  const created = mkdtempSync(path.join(workspace, 'generated-files-'));
  createdFolders.push(created);
  return created;
}

describe('generated files', () => {
  it('writes a missing file with its folders and leaves no temporary file behind', async () => {
    const file = path.join(folder(), 'nested/deeper/a.d.ts');
    expect(await writeFileIfChanged(file, 'export {};')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('export {};');
    expect(readdirSync(path.dirname(file))).toEqual(['a.d.ts']);
  });

  it('keeps a file with the same content untouched and replaces a different one', async () => {
    const file = path.join(folder(), 'a.d.ts');
    writeFileSync(file, 'export {};');
    const past = new Date('2020-01-01T00:00:00Z');
    utimesSync(file, past, past);
    expect(await writeFileIfChanged(file, 'export {};')).toBe(false);
    expect(statSync(file).mtimeMs).toBe(past.getTime());
    expect(await writeFileIfChanged(file, 'export default 1;')).toBe(true);
    expect(readFileSync(file, 'utf8')).toBe('export default 1;');
  });

  it('tells whether a file was there to remove or read', async () => {
    const file = path.join(folder(), 'a.d.ts');
    expect(await readTextIfExists(file)).toBeUndefined();
    expect(await removeFileIfExists(file)).toBe(false);
    writeFileSync(file, 'x');
    expect(await readTextIfExists(file)).toBe('x');
    expect(await removeFileIfExists(file)).toBe(true);
  });
});
