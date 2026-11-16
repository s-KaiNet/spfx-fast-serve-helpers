import { describe, expect, it } from 'vitest';
import { evaluateLocFile, renderLocModule } from './locModule.js';

describe('evaluateLocFile', () => {
  it('reads AMD loc files with a factory or an object', () => {
    expect(evaluateLocFile('define([], function () { return { A: "a" }; });', 'x.js')).toEqual({ A: 'a' });
    expect(evaluateLocFile('define({ B: "b" });', 'x.js')).toEqual({ B: 'b' });
  });

  it('fails clearly when nothing is defined', () => {
    expect(() => evaluateLocFile('var x = 1;', 'loc/en-us.js')).toThrow('loc/en-us.js did not define a strings object');
  });
});

describe('renderLocModule', () => {
  it('exports the object as default and identifier keys by name', () => {
    const code = renderLocModule({ Title: 'Hello', 'not-id': 'x' });
    expect(code).toContain('export default strings;');
    expect(code).toContain('export { __s0 as Title };');
    expect(code).not.toContain('as not-id');
  });
});
