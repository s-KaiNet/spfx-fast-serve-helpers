import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { packageDirectory } from '../testing/compileKit.js';
import { isLintedFile, sourceRootOf } from './lintFiles.js';
import { otherLinterName } from './plugin.js';
import { findProjectEslint } from './projectEslint.js';
import type { LintMessage } from './protocol.js';
import { createLintReport, formatFileMessages, MAX_LISTED_MESSAGES } from './report.js';
import { lintCacheFile } from './runner.js';
import { LINTED_FILES, NO_TYPE_INFORMATION, ruleSeverity, skipTypeAwareConfig, toFileResult, typeAwareRules, typeInformationRule, TYPESCRIPT_FILES } from './worker.js';

const ROOT = path.join(tmpdir(), 'contoso-project');
const FILE = path.join(ROOT, 'src/webparts/hello/Hello.tsx');

function message(line: number, column: number, severity: LintMessage['severity'], ruleId: string, text = `${ruleId} says no`): LintMessage {
  return { line, column, severity, ruleId, message: text };
}

const typed = (requiresTypeChecking: boolean) => ({ meta: { docs: { requiresTypeChecking } } });

describe('type-aware rules', () => {
  it('finds enabled plugin rules whose metadata needs type information', () => {
    const config = {
      rules: {
        '@typescript-eslint/no-floating-promises': ['error'],
        '@typescript-eslint/no-for-in-array': 2,
        '@typescript-eslint/no-unused-vars': 'warn',
        '@typescript-eslint/await-thenable': 'off',
        '@rushstack/security/no-unsafe-regexp': [1],
        'no-var': 'error',
      },
      plugins: {
        '@typescript-eslint': { rules: { 'no-floating-promises': typed(true), 'no-for-in-array': typed(true), 'no-unused-vars': typed(false), 'await-thenable': typed(true) } },
        '@rushstack/security': { rules: { 'no-unsafe-regexp': typed(true) } },
      },
    };
    expect(typeAwareRules(config)).toEqual(['@typescript-eslint/no-floating-promises', '@typescript-eslint/no-for-in-array', '@rushstack/security/no-unsafe-regexp']);
    expect(typeAwareRules(undefined)).toEqual([]);
    expect(typeAwareRules({ rules: { 'unknown/rule': 'error' }, plugins: {} })).toEqual([]);
  });

  it('reads rule severities in every ESLint notation', () => {
    expect([ruleSeverity('error'), ruleSeverity(['warn', {}]), ruleSeverity(0), ruleSeverity('off'), ruleSeverity(undefined)]).toEqual([2, 1, 0, 0, 0]);
  });

  it('names the rule from a "requires type information" error and nothing else', () => {
    const thrown = "Error while loading rule '@contoso/needs-types': You have used a rule which requires type information, but don't have parserOptions set to generate type information for this file.";
    expect(typeInformationRule(thrown)).toBe('@contoso/needs-types');
    expect(typeInformationRule("Error while loading rule 'old/rule': You have used a rule which requires parserServices to be generated.")).toBe('old/rule');
    expect(typeInformationRule("Error while loading rule 'some/rule': Cannot read properties of undefined")).toBeUndefined();
  });

  it('appends disable-type-checked for TypeScript files, drops the type information and turns off the found rules', () => {
    const disableTypeChecked = { name: 'typescript-eslint/disable-type-checked', rules: { '@typescript-eslint/no-floating-promises': 'off' } };
    expect(skipTypeAwareConfig(disableTypeChecked, ['z/rule', '@contoso/needs-types'])).toEqual([
      { ...disableTypeChecked, files: TYPESCRIPT_FILES },
      { files: TYPESCRIPT_FILES, languageOptions: NO_TYPE_INFORMATION },
      { files: LINTED_FILES, rules: { '@contoso/needs-types': 'off', 'z/rule': 'off' } },
    ]);
    expect(skipTypeAwareConfig(undefined, [])).toEqual([{ files: TYPESCRIPT_FILES, languageOptions: NO_TYPE_INFORMATION }]);
  });
});

describe('ESLint results', () => {
  it('keeps rule messages, marks unparsable and ignored files', () => {
    expect(toFileResult({ filePath: FILE, messages: [{ line: 3, column: 7, severity: 1, ruleId: 'no-unused-vars', message: 'unused' }] })).toEqual({
      file: FILE,
      status: 'linted',
      messages: [{ line: 3, column: 7, severity: 'warning', ruleId: 'no-unused-vars', message: 'unused' }],
    });
    expect(toFileResult({ filePath: FILE, messages: [{ line: 1, column: 1, severity: 2, ruleId: null, message: 'Parsing error: ; expected', fatal: true }] }).status).toBe('unparsable');
    expect(toFileResult({ filePath: FILE, messages: [{ severity: 1, ruleId: null, message: 'File ignored because no matching configuration was supplied.' }] }).status).toBe('ignored');
  });
});

describe('lint report', () => {
  it('prints a file once per change of its findings and "clean" once when they are gone', () => {
    const report = createLintReport(ROOT);
    const unused = message(4, 7, 'warning', '@typescript-eslint/no-unused-vars', "'x' is assigned a value but never used.");
    const first = report.update({ file: FILE, status: 'linted', messages: [unused, message(2, 1, 'error', 'no-var', 'Unexpected var.')] });
    expect(first).toEqual({
      level: 'warn',
      text: [
        'lint: src/webparts/hello/Hello.tsx: 1 error, 1 warning',
        '  2:1  error    Unexpected var.  no-var',
        "  4:7  warning  'x' is assigned a value but never used.  @typescript-eslint/no-unused-vars",
      ].join('\n'),
    });
    expect(report.update({ file: FILE, status: 'linted', messages: [message(2, 1, 'error', 'no-var', 'Unexpected var.'), unused] })).toBeUndefined();
    expect(report.update({ file: FILE, status: 'unparsable' })).toBeUndefined();
    expect(report.update({ file: FILE, status: 'linted', messages: [unused] })?.text).toMatch(/^lint: src\/webparts\/hello\/Hello\.tsx: 1 warning\n/);
    expect(report.update({ file: FILE, status: 'linted', messages: [] })).toEqual({ level: 'info', text: 'lint: src/webparts/hello/Hello.tsx: clean' });
    expect(report.update({ file: FILE, status: 'linted', messages: [] })).toBeUndefined();
  });

  it('stays quiet for files that were clean from the start and forgets removed files', () => {
    const report = createLintReport(ROOT);
    expect(report.update({ file: FILE, status: 'linted', messages: [] })).toBeUndefined();
    expect(report.update({ file: FILE, status: 'ignored' })).toBeUndefined();
    const findings = { file: FILE, status: 'linted' as const, messages: [message(1, 1, 'warning', 'eqeqeq')] };
    expect(report.update(findings)).toBeDefined();
    report.forget(FILE);
    expect(report.update(findings)).toBeDefined();
  });

  it('lists at most a fixed number of findings per file', () => {
    const many = Array.from({ length: MAX_LISTED_MESSAGES + 3 }, (_unused, index) => message(index + 1, 1, 'warning', 'eqeqeq'));
    const lines = formatFileMessages(ROOT, FILE, many).split('\n');
    expect(lines[0]).toBe(`lint: src/webparts/hello/Hello.tsx: ${MAX_LISTED_MESSAGES + 3} warnings`);
    expect(lines).toHaveLength(MAX_LISTED_MESSAGES + 2);
    expect(lines.at(-1)).toBe('  … and 3 more');
    expect(lines[1]).toBe('  1:1   warning  eqeqeq says no  eqeqeq');
  });
});

describe('linted files', () => {
  it('lints TypeScript and JavaScript sources only', () => {
    expect(['a.ts', 'a.tsx', 'a.js', 'a.jsx'].map(isLintedFile)).toEqual([true, true, true, true]);
    expect(['a.d.ts', 'a.scss', 'a.json', 'a.module.scss.ts.map', path.join('node_modules', 'x', 'a.ts')].map(isLintedFile)).toEqual([false, false, false, false, false]);
  });

  it('picks the innermost source folder', () => {
    const consumer = { root: ROOT, sourceDir: path.join(ROOT, 'src') };
    const nested = { root: path.join(ROOT, 'src/lib'), sourceDir: path.join(ROOT, 'src/lib/src') };
    expect(sourceRootOf(path.join(ROOT, 'src/lib/src/a.ts'), [consumer, nested])).toBe(nested);
    expect(sourceRootOf(FILE, [consumer, nested])).toBe(consumer);
    expect(sourceRootOf(path.join(ROOT, 'config/a.ts'), [consumer, nested])).toBeUndefined();
  });

  it('keeps one cache file per code root and mode under temp/fast-serve', () => {
    expect(lintCacheFile(ROOT, 'the project', 'skip-type-aware')).toBe(path.join(ROOT, 'temp/fast-serve/eslint/the-project-skip-type-aware.cache'));
    expect(lintCacheFile(ROOT, '@contoso/corp-lib', 'full')).toBe(path.join(ROOT, 'temp/fast-serve/eslint/contoso-corp-lib-full.cache'));
  });
});

describe('a linter from the extend file', () => {
  it('is recognised by its class name', () => {
    class ESLintRspackPlugin {
      readonly bundler = 'rspack';
    }
    class ESLintWebpackPlugin {
      readonly bundler = 'webpack';
    }
    expect(otherLinterName([{}, new ESLintRspackPlugin()])).toBe('ESLintRspackPlugin');
    expect(otherLinterName([new ESLintWebpackPlugin()])).toBe('ESLintWebpackPlugin');
    expect(otherLinterName([undefined, null, {}])).toBeUndefined();
  });
});

describe('findProjectEslint', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  const project = (files: Record<string, string>, withEslint: boolean): string => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-eslint-'));
    writeFileSync(path.join(root, 'package.json'), '{ "name": "contoso" }');
    for (const [file, content] of Object.entries(files)) writeFileSync(path.join(root, file), content);
    if (withEslint) {
      mkdirSync(path.join(root, 'node_modules'));
      symlinkSync(packageDirectory('eslint'), path.join(root, 'node_modules/eslint'), 'dir');
    }
    return root;
  };

  it("finds the project's ESLint 9 and its flat config", () => {
    const found = findProjectEslint(project({ 'eslint.config.cjs': 'module.exports = [];' }, true));
    expect(found).toMatchObject({ found: true, version: '9.37.0', configFile: path.join(root ?? '', 'eslint.config.cjs') });
    expect(found.found && found.eslintPath).toMatch(/eslint[\\/]lib[\\/]api\.js$/);
  });

  it('says why lint stays off', () => {
    expect(findProjectEslint(project({ '.eslintrc.js': 'module.exports = {};' }, true))).toEqual({ found: false, reason: 'no eslint.config.js / eslint.config.mjs / eslint.config.cjs' });
    rmSync(root ?? '', { recursive: true, force: true });
    const legacy = project({ 'eslint.config.mjs': 'export default [];' }, false);
    mkdirSync(path.join(legacy, 'node_modules/eslint'), { recursive: true });
    writeFileSync(path.join(legacy, 'node_modules/eslint/package.json'), '{ "name": "eslint", "version": "8.57.0", "main": "lib/api.js" }');
    expect(findProjectEslint(legacy)).toEqual({ found: false, reason: "the project's ESLint 8.57.0 is older than 9 (flat config)" });
  });
});
