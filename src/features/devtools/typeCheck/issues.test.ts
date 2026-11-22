import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createIssuesChangeDetector, formatIssue, issuesKey, issuesOutside, MAX_LISTED_ISSUES, typeCheckResult, typeCheckSummary, type TypeIssue } from './issues.js';
import { filesTheCompilerCannotBuild } from './plugin.js';

const ROOT = path.resolve('/projects/contoso');
const SECOND = path.join(ROOT, 'src/webparts/second/components/Second.tsx');
const SOURCE = ['import * as React from "react";', '', 'export function Second() {', '  return <h3>{(escape1 as string)}</h3>;', '}', ''].join('\n');

const escapeError: TypeIssue = {
  severity: 'error',
  code: 'TS2552',
  message: "Cannot find name 'escape1'. Did you mean 'escape'?",
  file: SECOND,
  location: { start: { line: 4, column: 17 } },
};

const readSecond = (file: string) => (file === SECOND ? SOURCE : undefined);

describe('type check issues', () => {
  it('formats an issue with its project-relative location, code and a code frame', () => {
    expect(formatIssue(escapeError, ROOT, readSecond)).toBe(
      [
        'type error in src/webparts/second/components/Second.tsx:4:17',
        "TS2552: Cannot find name 'escape1'. Did you mean 'escape'?",
        '  2 | ',
        '  3 | export function Second() {',
        '> 4 |   return <h3>{(escape1 as string)}</h3>;',
        '    |                 ^',
        '  5 | }',
        '  6 | ',
      ]
        .map((line) => line.trimEnd())
        .join('\n'),
    );
  });

  it('formats issues without a file or without a readable source', () => {
    expect(formatIssue({ severity: 'error', code: 'TS6053', message: "File 'x' not found." }, ROOT)).toBe("type error\nTS6053: File 'x' not found.");
    expect(formatIssue({ ...escapeError, severity: 'warning' }, ROOT, () => undefined)).toBe(
      "type warning in src/webparts/second/components/Second.tsx:4:17\nTS2552: Cannot find name 'escape1'. Did you mean 'escape'?",
    );
  });

  it('summarizes counts', () => {
    expect(typeCheckSummary(0, 0)).toBe('type check: no errors');
    expect(typeCheckSummary(1, 0)).toBe('type check: 1 error');
    expect(typeCheckSummary(3, 1)).toBe('type check: 3 errors, 1 warning');
    expect(typeCheckSummary(0, 2)).toBe('type check: 2 warnings');
  });

  it('orders issues by file and position and lists at most a fixed number of them', () => {
    const issues = Array.from({ length: MAX_LISTED_ISSUES + 3 }, (_, index): TypeIssue => ({ ...escapeError, location: { start: { line: MAX_LISTED_ISSUES + 3 - index, column: 1 } } }));
    const result = typeCheckResult(issues, ROOT, () => undefined);
    expect(result).toMatchObject({ errors: MAX_LISTED_ISSUES + 3, warnings: 0, summary: `type check: ${MAX_LISTED_ISSUES + 3} errors` });
    expect(result.blocks).toHaveLength(MAX_LISTED_ISSUES + 1);
    expect(result.blocks[0]).toContain('Second.tsx:1:1');
    expect(result.blocks.at(-1)).toBe('… and 3 more type issues (heft build lists them all)');
  });

  it('identifies the issue set regardless of order', () => {
    const other: TypeIssue = { ...escapeError, code: 'TS2322', message: 'Type mismatch', location: { start: { line: 2, column: 1 } } };
    expect(issuesKey([escapeError, other])).toBe(issuesKey([other, escapeError]));
    expect(issuesKey([escapeError])).not.toBe(issuesKey([{ ...escapeError, location: { start: { line: 5, column: 17 } } }]));
  });

  it('reports a change only when the set of issues changes, starting with the first result', () => {
    const changed = createIssuesChangeDetector();
    expect(changed([])).toBe(true);
    expect(changed([])).toBe(false);
    expect(changed([escapeError])).toBe(true);
    expect(changed([{ ...escapeError }])).toBe(false);
    expect(changed([])).toBe(true);
  });

  it('leaves out the issues of files the compiler cannot build, whose syntax errors it already reports', () => {
    const props = path.join(ROOT, 'src/webparts/second/components/ISecondProps.ts');
    const syntax: TypeIssue = { severity: 'error', code: 'TS1005', message: "'}' expected.", file: SECOND, location: { start: { line: 4, column: 40 } } };
    const typeOnlySyntax: TypeIssue = { ...syntax, file: props };
    const global: TypeIssue = { severity: 'error', code: 'TS2688', message: "Cannot find type definition file for 'node'." };
    const stats = {
      compilation: {
        errors: [
          { name: 'ModuleBuildError', module: { resource: `${SECOND}?raw` } },
          { name: 'Error', module: { resource: props } },
          { name: 'ModuleBuildError', module: undefined },
        ],
      },
    } as unknown as Parameters<typeof filesTheCompilerCannotBuild>[0];
    const unbuildable = filesTheCompilerCannotBuild(stats);
    expect([...unbuildable]).toEqual([SECOND]);
    expect(issuesOutside([escapeError, syntax, typeOnlySyntax, global], unbuildable)).toEqual([typeOnlySyntax, global]);
  });
});

