import { describe, expect, it } from 'vitest';
import { problemLocation, tidyMessage } from './problems.js';

const ROOT = '/work/project';

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
