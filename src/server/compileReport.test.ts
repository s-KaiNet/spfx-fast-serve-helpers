import { describe, expect, it } from 'vitest';
import { changedProjectFiles, compileSummary, formatCompileProblems, problemLocation, tidyMessage } from './compileReport.js';

const ROOT = '/work/project';

const SWC_SYNTAX_ERROR = [
  '  × Module build failed (from builtin:swc-loader):',
  '  ╰─▶   × Syntax Error: Expression expected',
  '          ╭─[8:30]',
  '        7 │ export default function Second() {',
  '        8 │   const [clicks, setClicks] = =  = React.useState(0);',
  '          ·                               ─',
  '        9 │   return (',
  '          ╰────',
  '      ',
  '',
].join('\n');

describe('formatCompileProblems', () => {
  it('names the module relative to the project and unwraps the loader failure', () => {
    const [formatted] = formatCompileProblems(
      'error',
      [{ message: SWC_SYNTAX_ERROR, moduleIdentifier: `builtin:swc-loader??ruleSet[1].rules[2]!${ROOT}/src/webparts/second/components/Second.tsx`, moduleName: './src/webparts/second/components/Second.tsx' }],
      ROOT,
    );
    expect(formatted?.split('\n')).toEqual([
      'error in src/webparts/second/components/Second.tsx',
      '× Syntax Error: Expression expected',
      '  ╭─[8:30]',
      '7 │ export default function Second() {',
      '8 │   const [clicks, setClicks] = =  = React.useState(0);',
      '  ·                               ─',
      '9 │   return (',
      '  ╰────',
    ]);
  });

  it('prints each distinct problem once', () => {
    const warning = { message: "  ⚠ export 'x' was not found\n", moduleName: './src/a.ts', loc: '3:1' };
    expect(formatCompileProblems('warning', [warning, warning, { message: 'other' }], ROOT)).toEqual(["warning in src/a.ts:3:1\n⚠ export 'x' was not found", 'warning\nother']);
  });
});

describe('problemLocation', () => {
  it('prefers the resource of the module identifier and falls back to the module name', () => {
    expect(problemLocation({ message: '', moduleIdentifier: `css|${ROOT}/src/a.module.scss|0||||}`, loc: '2:4' }, ROOT)).toBe('src/a.module.scss:2:4');
    expect(problemLocation({ message: '', moduleIdentifier: '/elsewhere/lib/index.js?raw' }, ROOT)).toBe('/elsewhere/lib/index.js');
    expect(problemLocation({ message: '', moduleName: './node_modules/pkg/index.js' }, ROOT)).toBe('node_modules/pkg/index.js');
    expect(problemLocation({ message: '' }, ROOT)).toBeUndefined();
  });
});

describe('tidyMessage', () => {
  it('drops trailing blank lines and common indentation', () => {
    expect(tidyMessage('\n    a\n      b   \n   \n')).toBe('a\n  b');
  });
});

describe('compileSummary', () => {
  it('keeps the line short: time, changed files and only non-zero counts', () => {
    expect(compileSummary({ verb: 'compiled', durationMs: 640, changedFiles: [], errors: 0, warnings: 0 })).toBe('compiled in 640 ms');
    expect(compileSummary({ verb: 'rebuilt', durationMs: 42, changedFiles: ['src/a.tsx'], errors: 1, warnings: 0 })).toBe('rebuilt in 42 ms (src/a.tsx): 1 error');
    expect(compileSummary({ verb: 'rebuilt', durationMs: 50, changedFiles: ['a', 'b', 'c', 'd'], errors: 0, warnings: 2 })).toBe('rebuilt in 50 ms (a, b +2 more): 2 warnings');
  });

  it('lists changed files inside the project relative to it', () => {
    expect(changedProjectFiles(ROOT, [`${ROOT}/src/b.ts`, `${ROOT}/src/a.ts`, '/elsewhere/x.ts', ROOT, `${ROOT}/src/a.ts`])).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('names changed files and problems of linked library projects relative to the project', () => {
    expect(changedProjectFiles(ROOT, ['/work/corp-lib/src/Counter.tsx', '/elsewhere/x.ts', '/work/corp-lib'], ['/work/corp-lib'])).toEqual(['../corp-lib/src/Counter.tsx']);
    expect(problemLocation({ message: '', moduleIdentifier: 'builtin:swc-loader!/work/corp-lib/src/Counter.tsx', loc: '3:1' }, ROOT, ['/work/corp-lib'])).toBe('../corp-lib/src/Counter.tsx:3:1');
  });
});
