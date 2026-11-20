import { describe, expect, it } from 'vitest';
import { evaluateAmd } from '../testing/compileKit.js';
import { evaluateStrings, heftStringsRequest, stringsModuleSource } from './heftStrings.js';

describe('heftStringsRequest', () => {
  it('parses the strings file names of a heft development package', () => {
    expect(heftStringsRequest('/dist/HelloWorldWebPartStrings_en-us.js')).toEqual({ name: 'HelloWorldWebPartStrings', locale: 'en-us' });
    expect(heftStringsRequest('/dist/My_Strings_de-DE.js')).toEqual({ name: 'My_Strings', locale: 'de-DE' });
  });

  it('ignores bundles, chunks and other paths', () => {
    for (const urlPath of ['/dist/hello-world-web-part.js', '/dist/chunk.Hello-property-pane.js', '/temp/build/Strings_en-us.js', '/dist/sub/Strings_en-us.js', '/dist/Strings_en-us.js.map']) {
      expect(heftStringsRequest(urlPath)).toBeUndefined();
    }
  });
});

describe('evaluateStrings', () => {
  it('reads AMD, ES module, CommonJS and TypeScript strings files', () => {
    expect(evaluateStrings('define([], function () { return { "Title": "Hello" }; });', '/p/en-us.js')).toEqual({ Title: 'Hello' });
    expect(evaluateStrings('define({ Title: "Object" });', '/p/en-us.js')).toEqual({ Title: 'Object' });
    expect(evaluateStrings('export default { Title: "Module" };', '/p/en-us.js')).toEqual({ Title: 'Module' });
    expect(evaluateStrings('module.exports = { Title: "CommonJS" };', '/p/en-us.js')).toEqual({ Title: 'CommonJS' });
    expect(evaluateStrings('const strings: Record<string, string> = { Title: "TypeScript" };\nexport default strings;', '/p/en-us.ts')).toEqual({ Title: 'TypeScript' });
  });

  it('rejects files without strings and files that require other modules', () => {
    expect(() => evaluateStrings('define([], function () { return 1; });', '/p/en-us.js')).toThrow('must define or export an object');
    expect(() => evaluateStrings('module.exports = require("./other");', '/p/en-us.js')).toThrow('can\'t require "./other"');
  });
});

describe('stringsModuleSource', () => {
  it('renders an AMD module that returns the strings', () => {
    const source = stringsModuleSource({ Title: 'Hello "there"', Nested: { Label: 'x' } });
    expect(evaluateAmd(source)).toEqual({ dependencies: [], exports: { Title: 'Hello "there"', Nested: { Label: 'x' } } });
  });
});
