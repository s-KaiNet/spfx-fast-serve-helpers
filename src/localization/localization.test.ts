import { cpSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import type { Logger } from '../shared/logger.js';
import { createProject } from '../project/index.js';
import { compileOnce } from '../bundler/index.js';
import { locFileFormat, moduleLocWrapperSource } from './index.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/externals', import.meta.url));

describe('locFileFormat', () => {
  it('recognises AMD loc files', () => {
    expect(locFileFormat('define([], function () { return { "Title": "x" }; });')).toBe('amd');
    expect(locFileFormat('/* header */\ndefine("Strings", [], () => ({ Title: "x" }));')).toBe('amd');
  });

  it('treats ES and CommonJS modules as modules, ignoring define in comments and member calls', () => {
    expect(locFileFormat('const strings = { Title: "x" };\nexport default strings;')).toBe('module');
    expect(locFileFormat('module.exports = { Title: "x" };')).toBe('module');
    expect(locFileFormat('// define([], ...)\nexport default { Title: "x" };')).toBe('module');
    expect(locFileFormat('Object.define({});\nexport default {};')).toBe('module');
  });
});

function runWrapper(strings: unknown): unknown {
  const module = { exports: {} as unknown };
  vm.runInNewContext(moduleLocWrapperSource('/p/src/loc/en-us.ts'), { module, require: () => strings });
  return module.exports;
}

describe('moduleLocWrapperSource', () => {
  it('exposes the default export of an ES loc module as the strings object', () => {
    expect(runWrapper({ __esModule: true, default: { Title: 'es' } })).toEqual({ Title: 'es' });
    expect(runWrapper({ Title: 'cjs' })).toEqual({ Title: 'cjs' });
  });
});

describe('compileOnce with --locale', () => {
  it('bundles the selected locale for project and library strings and falls back to en-us per resource', async () => {
    const root = mkdtempSync(path.join(tmpdir(), 'fast-serve-locale-'));
    try {
      cpSync(fixture, root, { recursive: true });
      const messages: string[] = [];
      const logger: Logger = {
        info: (message) => messages.push(`info: ${message}`),
        warn: (message) => messages.push(`warn: ${message}`),
        error: (message) => messages.push(`error: ${message}`),
      };
      const outputPath = path.join(root, 'out');
      const context = { root, project: createProject(root, logger), options: { origin: 'https://localhost:4433', locale: 'de-de', overlay: true }, logger };
      const result = await compileOnce(context, { outputPath });
      expect(result.errors).toEqual([]);
      expect(messages).toEqual(expect.arrayContaining(['warn: LabelStrings: no "de-de" strings, using en-us', 'warn: TsStrings: no "de-de" strings, using en-us']));
      expect(messages.filter((message) => message.includes('ProbeStrings') || message.includes('ContosoControlStrings'))).toEqual([]);
      const source = readFileSync(path.join(outputPath, 'probe-web-part.js'), 'utf8');
      expect(source).toContain('Sondentitel');
      expect(source).toContain('Suchen');
      expect(source).toContain('Label text');
      expect(source).not.toContain('Probe title');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }, 60_000);
});
