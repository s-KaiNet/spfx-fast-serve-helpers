import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rolldown } from 'rolldown';
import type { Plugin, Rolldown, UserConfig } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import type { ServeContext } from '../../context.js';
import { localizationPlugin } from '../../localization/index.js';
import { createProject } from '../../project/index.js';
import { createCssClassNameGenerator } from './cssClassName.js';
import { libraryCssPlugin } from './index.js';
import { resolveLibraryCssFile } from './resolveLibraryCss.js';
import { createLibraryCssCompiler, resolveSpCssLoader } from './spCssLoader.js';

const root = fileURLToPath(new URL('../../../test/fixtures/basic/', import.meta.url));
const controlsDir = path.join(root, 'node_modules/@pnp/controls/lib/controls');
const benchControlsDir = '/home/sergei/Projects/spfx-bench/node_modules/@pnp/spfx-controls-react/lib/controls';

const heftOutput = {
  'peoplepicker/PeoplePickerComponent': {
    hash: 'b085a859',
    css:
      '.defaultClass_b085a859{color:#000}.errorMessage_b085a859{align-items:center;color:#a80000;display:flex;font-size:12px;' +
      'font-weight:400;margin:0;padding-top:5px}.errorIcon_b085a859{font-size:14px;margin-right:5px}',
    classes: { defaultClass: 'defaultClass_b085a859', errorMessage: 'errorMessage_b085a859', errorIcon: 'errorIcon_b085a859' },
  },
  'errorMessage/ErrorMessage': {
    hash: 'f9a54bd5',
    css:
      '.errorMessage_f9a54bd5{align-items:center;color:#a80000;display:flex;font-size:12px;font-weight:400;margin:0;' +
      'padding-top:5px}.errorIcon_f9a54bd5{font-size:14px;margin-right:5px}',
    classes: { errorMessage: 'errorMessage_f9a54bd5', errorIcon: 'errorIcon_f9a54bd5' },
  },
  'dragDropFiles/DragDropFiles': {
    hash: '520e7a5c',
    css:
      '.DragDropFilesArea_520e7a5c{min-height:150px;position:relative}.DragDropFilesAreaLeave_520e7a5c{position:relative}' +
      '.DragDropFilesAreaBorder_520e7a5c{background-color:hsla(0,0%,100%,.6);border:1px dashed grey;bottom:0;left:0;' +
      'position:absolute;right:0;top:0;z-index:1}.DragDropFilesAreaZone_520e7a5c{color:grey;font-size:34px;left:0;' +
      'position:absolute;right:0;text-align:center;top:35%}',
    classes: {
      DragDropFilesArea: 'DragDropFilesArea_520e7a5c',
      DragDropFilesAreaLeave: 'DragDropFilesAreaLeave_520e7a5c',
      DragDropFilesAreaBorder: 'DragDropFilesAreaBorder_520e7a5c',
      DragDropFilesAreaZone: 'DragDropFilesAreaZone_520e7a5c',
    },
  },
};

const fixtureCssFile = (control: string) => path.join(controlsDir, `${control}.module.scss.css`);

function createContext(): ServeContext {
  const logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
  return {
    root,
    project: createProject(root, logger),
    logger,
    options: { port: 4400, origin: 'https://localhost:4400', locale: 'en-us', pageUrl: undefined, pageUrlTemplate: undefined },
  };
}

function prebundlePlugins(plugins: Plugin[]): Rolldown.Plugin[] {
  return plugins.flatMap((plugin) => {
    const config = (plugin.config as () => UserConfig)();
    return (config.optimizeDeps?.rolldownOptions?.plugins ?? []) as Rolldown.Plugin[];
  });
}

function parseCompiledModule(code: string): { css: string; classes: Record<string, string> } {
  const css = /loadStyles\(("(?:[^"\\]|\\.)*"), true\);/.exec(code)?.[1];
  const classes = /export default (\{[\s\S]*\});/.exec(code)?.[1];
  if (css === undefined || classes === undefined) throw new Error(`unexpected sp-css-loader output:\n${code}`);
  return { css: JSON.parse(css) as string, classes: JSON.parse(classes.replaceAll(/^\s*(\w+):/gm, '"$1":')) as Record<string, string> };
}

describe('createCssClassNameGenerator', () => {
  it('produces the class names heft produced for @pnp/spfx-controls-react in spfx-bench', () => {
    for (const [control, expected] of Object.entries(heftOutput)) {
      const generate = createCssClassNameGenerator();
      const benchFile = `${benchControlsDir}/${control}.module.scss.css`;
      const css = readFileSync(fixtureCssFile(control), 'utf8');
      expect(generate('defaultClass', benchFile, css)).toBe(`defaultClass_${expected.hash}`);
    }
  });

  it('keeps the first hash of a file, like heft', () => {
    const generate = createCssClassNameGenerator();
    expect(generate('a', '/x.css', '.a{}')).toBe(generate('b', '/x.css', '.b{color:red}').replace(/^b/, 'a'));
  });
});

describe('resolveLibraryCssFile', () => {
  const importer = path.join(controlsDir, 'peoplepicker/PeoplePickerComponent.js');

  it('falls back to the precompiled .css when the requested style file is missing', () => {
    expect(resolveLibraryCssFile('./PeoplePickerComponent.module.scss', importer)).toBe(fixtureCssFile('peoplepicker/PeoplePickerComponent'));
    expect(resolveLibraryCssFile(path.join(controlsDir, 'gridLayout/GridTheme.scss'), importer)).toBe(
      path.join(controlsDir, 'gridLayout/GridTheme.scss.css'),
    );
  });

  it('leaves existing files, scripts, bare specifiers and style importers alone', () => {
    expect(resolveLibraryCssFile('./PeoplePickerComponent.module.scss.css', importer)).toBeUndefined();
    expect(resolveLibraryCssFile('./PeoplePickerComponent', importer)).toBeUndefined();
    expect(resolveLibraryCssFile('@pnp/controls/lib/controls/peoplepicker/PeoplePickerComponent.module.scss', importer)).toBeUndefined();
    expect(resolveLibraryCssFile('./PeoplePickerComponent.module.scss', path.join(controlsDir, 'peoplepicker/x.scss'))).toBeUndefined();
    expect(resolveLibraryCssFile('./PeoplePickerComponent.module.scss', '\0virtual')).toBeUndefined();
    expect(resolveLibraryCssFile('./PeoplePickerComponent.module.scss', undefined)).toBeUndefined();
  });
});

describe('createLibraryCssCompiler', () => {
  const compile = createLibraryCssCompiler({ root, warn: () => undefined });

  it('produces the CSS and class map heft produced, apart from the path-dependent hash', async () => {
    const checks = Object.entries(heftOutput).map(async ([control, expected]) => {
      const file = fixtureCssFile(control);
      const hash = createCssClassNameGenerator()('x', file, readFileSync(file, 'utf8')).slice(2);
      const compiled = parseCompiledModule(await compile(file));
      expect(compiled.css.replaceAll(hash, expected.hash)).toBe(expected.css);
      expect(JSON.parse(JSON.stringify(compiled.classes).replaceAll(hash, expected.hash))).toEqual(expected.classes);
    });
    await Promise.all(checks);
  });

  it('applies :global, :export and keeps theme tokens for load-themed-styles', async () => {
    const code = await compile(path.join(controlsDir, 'gridLayout/GridLayout.module.scss.css'));
    expect(code).toMatch(/import \* as __LOAD_THEMED_STYLES__ from "[^"]*@microsoft\/load-themed-styles\/lib-es6\/index\.js";/);
    const { css, classes } = parseCompiledModule(code);
    expect(css).toMatch(/^\.gridLayout_\w{8} \.gridLayoutList_\w{8} \.ms-DocumentCard\{/);
    expect(css).toMatch(/\.gridLayout_\w{8} \.ms-DocumentCardTitle\{/);
    expect(css).toContain('"[theme: white, default: #ffffff]"');
    expect(css).toContain('"[theme: themePrimary, default: #0078d7]"');
    expect(classes).toMatchObject({ padding: '20', minWidth: '210' });
    expect(classes.gridLayout).toMatch(/^gridLayout_\w{8}$/);
  });

  it('compiles non-module styles as global CSS', async () => {
    const code = await compile(path.join(controlsDir, 'gridLayout/GridTheme.scss.css'));
    expect(code).toContain('loadStyles(".ms-Grid-themed{color:\\"[theme: neutralPrimary, default: #323130]\\"}", true);');
    expect(code).not.toContain('export default');
  });
});

describe('resolveSpCssLoader', () => {
  let projectDir: string | undefined;
  afterEach(() => {
    if (projectDir) rmSync(projectDir, { recursive: true, force: true });
  });

  it('fails clearly when the project has no @microsoft/sp-css-loader', () => {
    const emptyProject = mkdtempSync(path.join(tmpdir(), 'fast-serve-no-loader-'));
    projectDir = emptyProject;
    expect(() => resolveSpCssLoader(emptyProject)).toThrow(/@microsoft\/sp-css-loader was not found .* ships with @microsoft\/spfx-heft-plugins/);
  });
});

describe('pre-bundling', () => {
  it('inlines compiled library styles and keeps localized resources external', async () => {
    const context = createContext();
    const build = await rolldown({
      input: { peoplePicker: path.join(controlsDir, 'peoplepicker/PeoplePickerComponent.js'), grid: path.join(controlsDir, 'gridLayout/GridLayout.js') },
      plugins: prebundlePlugins([libraryCssPlugin(context), localizationPlugin(context)]),
      logLevel: 'silent',
    });
    const { output } = await build.generate({ format: 'esm' });
    await build.close();
    const code = output.map((chunk) => (chunk.type === 'chunk' ? chunk.code : '')).join('\n');

    expect(code).toMatch(/import \w+ from "ControlStrings";/);
    expect(code).toMatch(/loadStyles\("\.defaultClass_\w{8}\{color:#000\}/);
    expect(code).toMatch(/defaultClass: "defaultClass_\w{8}"/);
    expect(code).toContain('.ms-Grid-themed{');
    expect(code).toContain('function loadStyles(');
  });
});
