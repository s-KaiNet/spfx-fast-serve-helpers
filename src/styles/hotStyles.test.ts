import { afterEach, describe, expect, it, vi } from 'vitest';
import { withHotStyles } from './hotStylesLoader.js';
import { loadHotStyles } from './runtime/hotStyles.js';

const SP_CSS_LOADER_OUTPUT = [
  '// Imports',
  'import * as __LOAD_THEMED_STYLES__ from "/project/node_modules/@microsoft/load-themed-styles/lib/index.js";',
  '',
  '__LOAD_THEMED_STYLES__.loadStyles(".a_1234abcd{color:red}", true);',
  '',
  '// Exports',
  'export default {',
  '  a: "a_1234abcd"',
  '};',
].join('\n');

describe('withHotStyles', () => {
  it('routes the style insertion of an sp-css-loader module through the hot styles runtime', () => {
    const source = withHotStyles(SP_CSS_LOADER_OUTPUT, '/runtime/hotStyles.js');
    expect(source.split('\n')[0]).toBe('import { loadHotStyles as __FAST_SERVE_LOAD_HOT_STYLES__ } from "/runtime/hotStyles.js";');
    expect(source).toContain('__FAST_SERVE_LOAD_HOT_STYLES__(import.meta.webpackHot, __LOAD_THEMED_STYLES__, ".a_1234abcd{color:red}", true);');
    expect(source).not.toContain('__LOAD_THEMED_STYLES__.loadStyles(');
  });

  it('leaves modules without a style insertion unchanged', () => {
    expect(withHotStyles('export default {};', '/runtime/hotStyles.js')).toBe('export default {};');
  });
});

interface FakeStyle {
  text: string;
  removed: boolean;
  remove(): void;
}

function fakeThemedStyles() {
  const listeners = new Set<(event: Event) => void>();
  const state: { registeredStyles: { styleElement: FakeStyle }[]; registeredThemableStyles: { styleElement: FakeStyle }[] } = {
    registeredStyles: [],
    registeredThemableStyles: [],
  };
  vi.stubGlobal('document', {
    addEventListener: (_type: string, listener: (event: Event) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: Event) => void) => listeners.delete(listener),
  });
  vi.stubGlobal('__themeState__', state);
  const calls: [string, boolean | undefined][] = [];
  const themedStyles = {
    loadStyles(styles: string, loadAsync?: boolean) {
      calls.push([styles, loadAsync]);
      if (loadAsync) return;
      const style: FakeStyle = {
        text: styles,
        removed: false,
        remove() {
          this.removed = true;
        },
      };
      state.registeredStyles.push({ styleElement: style });
      for (const listener of listeners) listener(Object.assign(new Event('styleinsert'), { args: { newStyle: style } }));
    },
  };
  return { themedStyles, state, calls };
}

describe('loadHotStyles', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('keeps the batched insertion of load-themed-styles on the first evaluation of a module', () => {
    const { themedStyles, calls } = fakeThemedStyles();
    const disposers: (() => void)[] = [];
    loadHotStyles(undefined, themedStyles, '.a{}');
    loadHotStyles({ dispose: (callback) => disposers.push(callback) }, themedStyles, '.b{}');
    expect(calls).toEqual([
      ['.a{}', true],
      ['.b{}', true],
    ]);
    expect(disposers).toEqual([]);
  });

  it('inserts hot-updated styles as their own element and removes it when the next update disposes the module', () => {
    const { themedStyles, state, calls } = fakeThemedStyles();
    const disposers: (() => void)[] = [];
    loadHotStyles({ data: {}, dispose: (callback) => disposers.push(callback) }, themedStyles, '.a{color:red}');
    expect(calls).toEqual([['.a{color:red}', undefined]]);
    const [record] = state.registeredStyles;
    expect(disposers).toHaveLength(1);
    for (const dispose of disposers) dispose();
    expect(record?.styleElement.removed).toBe(true);
    expect(state.registeredStyles).toEqual([]);
  });
});
