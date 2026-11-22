import { createHmac } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyCompileFixture, evaluateAmd, type FixtureCopy } from '../testing/compileKit.js';
import { createHeftTerminal } from '../project/heft/heftProject.js';

const HEFT_PACKAGES = ['@microsoft/sp-css-loader', 'sass-embedded', '@rushstack/heft-sass-plugin', '@rushstack/heft-config-file', '@rushstack/rig-package'];
const COMPONENTS = 'src/webparts/hello/components';

const heftSassJson = {
  fileExtensions: ['.sass', '.scss', '.css'],
  nonModuleFileExtensions: ['.global.sass', '.global.scss', '.global.css'],
  cssOutputFolders: ['lib'],
  doNotTrimOriginalFileExtension: true,
  preserveIcssExports: true,
  sourceMap: true,
};

const styledProject = {
  'node_modules/fake-theme/package.json': { name: 'fake-theme', version: '1.0.0' },
  'node_modules/fake-theme/_theme.scss': '$theme-primary: "[theme:themePrimary, default:#0078d4]";\n',
  'node_modules/fake-theme/_mixins.scss': '@mixin box {\n  padding: 4px;\n}\n',
  'node_modules/fake-css/package.json': { name: 'fake-css', version: '1.0.0' },
  'node_modules/fake-css/dist/fake.css': '.rs-btn {\n  background: url(./icon.png);\n}\n',
  'node_modules/fake-css/dist/icon.png': 'png',
  [`${COMPONENTS}/_colors.scss`]: '$accent: #a4262c;\n',
  [`${COMPONENTS}/Hello.module.scss`]:
    "@use 'colors';\n@import 'pkg:fake-theme/theme';\n@import '~fake-theme/mixins';\n.hello {\n  color: $theme-primary;\n  border-color: colors.$accent;\n  @include box;\n  .inner {\n    margin: 0;\n  }\n}\n",
  [`${COMPONENTS}/Legacy.module.sass`]: '.legacy\n  margin: 0\n',
  [`${COMPONENTS}/app.global.scss`]: '.globalThing {\n  color: red;\n}\n',
  [`${COMPONENTS}/Hello.tsx`]: [
    "import * as React from 'react';",
    "import 'fake-css/dist/fake.css';",
    "import './app.global.scss';",
    "import styles from './Hello.module.scss';",
    "import legacy from './Legacy.module.sass';",
    "import type { IHelloProps } from './IHelloProps';",
    '',
    'export function renderHello({ title }: IHelloProps): unknown {',
    '  return <div className={`${styles.hello} ${styles.inner} ${legacy.legacy}`} title={title} />;',
    '}',
    '',
  ].join('\n'),
};

const copies: FixtureCopy[] = [];

afterEach(() => {
  for (const copy of copies.splice(0)) copy.remove();
});

function styledFixture(files: Record<string, string | object> = {}): FixtureCopy {
  const copy = copyCompileFixture({ ...styledProject, ...files });
  copies.push(copy);
  for (const name of HEFT_PACKAGES) copy.linkPackage(name);
  return copy;
}

interface HeftSassProcessor {
  compileFilesAsync(files: Set<string>): Promise<void>;
}

async function heftCompile(root: string, files: string[]): Promise<string[]> {
  const errors: string[] = [];
  const logger = { info: () => undefined, warn: (message: string) => errors.push(message), error: (message: string) => errors.push(message) };
  const requireFromRoot = createRequire(path.join(root, 'package.json'));
  const { SassProcessor } = requireFromRoot('@rushstack/heft-sass-plugin/lib/SassProcessor') as { SassProcessor: new (options: object) => HeftSassProcessor };
  const processor = new SassProcessor({
    buildFolder: root,
    concurrency: 1,
    logger: { terminal: createHeftTerminal(logger, 'heft'), emitError: (error: Error) => errors.push(error.message), emitWarning: () => undefined },
    srcFolder: path.join(root, 'src'),
    dtsOutputFolders: [path.join(root, 'temp/heft-sass-ts')],
    cssOutputFolders: [{ folder: path.join(root, 'lib') }],
    exportAsDefault: true,
    fileExtensions: heftSassJson.fileExtensions,
    nonModuleFileExtensions: heftSassJson.nonModuleFileExtensions,
    doNotTrimOriginalFileExtension: true,
    preserveIcssExports: true,
    sourceMap: true,
    silenceDeprecations: ['import'],
  });
  await processor.compileFilesAsync(new Set(files.map((file) => path.join(root, file))));
  return errors;
}

function heftClassName(root: string, sourceFile: string, className: string): string {
  const cssFile = path.join(root, 'lib', `${path.relative('src', sourceFile)}.css`);
  const cssAfterSourceMapLoader = readFileSync(cssFile, 'utf8').replace(/^\/\*# sourceMappingURL=[^\n]*\*\/\n$/m, '');
  return `${className}_${createHmac('sha1', cssFile).update(cssAfterSourceMapLoader).digest('hex').slice(0, 8)}`;
}

function renderedClassName(source: string): string {
  const WebPart = evaluateAmd(source).exports.default as new () => { render(): { props: { className: string } } };
  return new WebPart().render().props.className;
}

describe('Sass and CSS like heft', () => {
  it('names CSS module classes exactly like heft and compiles pkg:, ~, .sass, global and node_modules CSS', async () => {
    const copy = styledFixture({ 'config/sass.json': { ...heftSassJson, silenceDeprecations: ['import'] } });

    const { result, messages, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(messages).toEqual([]);
    expect(await heftCompile(copy.root, [`${COMPONENTS}/Hello.module.scss`, `${COMPONENTS}/Legacy.module.sass`])).toEqual([]);
    const source = bundle('single-web-part');
    expect(renderedClassName(source)).toBe(
      [
        heftClassName(copy.root, `${COMPONENTS}/Hello.module.scss`, 'hello'),
        heftClassName(copy.root, `${COMPONENTS}/Hello.module.scss`, 'inner'),
        heftClassName(copy.root, `${COMPONENTS}/Legacy.module.sass`, 'legacy'),
      ].join(' '),
    );
    expect(source).toContain('[theme:themePrimary, default:#0078d4]');
    expect(source).toContain('padding:4px');
    expect(source).toContain('.globalThing{color:red}');
    expect(source).toMatch(/\.rs-btn\{background:url\(/);
    expect(result.assets.some((asset) => /^icon_[0-9a-f]+\.png$/.test(asset))).toBe(true);
  }, 60_000);

  it('resolves ~ and pkg: imports of files hidden by package exports from the package folder, like heft', async () => {
    const hiddenPackage = 'node_modules/@contoso/hidden-sass';
    const copy = styledFixture({
      'config/sass.json': { ...heftSassJson, silenceDeprecations: ['import'] },
      [`${hiddenPackage}/package.json`]: { name: '@contoso/hidden-sass', version: '1.0.0', exports: { '.': './index.js' } },
      [`${hiddenPackage}/index.js`]: 'module.exports = {};\n',
      [`${hiddenPackage}/dist/sass/_tokens.scss`]: "@import '~inner-sass/vars';\n$hidden-color: $inner-color;\n@mixin hidden {\n  color: $hidden-color;\n}\n",
      [`${hiddenPackage}/node_modules/inner-sass/package.json`]: { name: 'inner-sass', version: '1.0.0', exports: { '.': './index.js' } },
      [`${hiddenPackage}/node_modules/inner-sass/_vars.scss`]: '$inner-color: #107c10;\n',
      [`${COMPONENTS}/TildeImport.module.scss`]: "@import '~@contoso/hidden-sass/dist/sass/tokens.scss';\n.tildeImport {\n  @include hidden;\n}\n",
      [`${COMPONENTS}/TildeUse.module.scss`]: "@use '~@contoso/hidden-sass/dist/sass/tokens' as t;\n.tildeUse {\n  @include t.hidden;\n}\n",
      [`${COMPONENTS}/PkgUse.module.scss`]: "@use 'pkg:@contoso/hidden-sass/dist/sass/tokens';\n.pkgUse {\n  @include tokens.hidden;\n}\n",
      [`${COMPONENTS}/PkgImport.module.scss`]: "@import 'pkg:@contoso/hidden-sass/dist/sass/_tokens';\n.pkgImport {\n  @include hidden;\n}\n",
      [`${COMPONENTS}/Hello.tsx`]: [
        "import * as React from 'react';",
        "import tildeImport from './TildeImport.module.scss';",
        "import tildeUse from './TildeUse.module.scss';",
        "import pkgUse from './PkgUse.module.scss';",
        "import pkgImport from './PkgImport.module.scss';",
        "import type { IHelloProps } from './IHelloProps';",
        '',
        'export function renderHello({ title }: IHelloProps): unknown {',
        '  return <div className={`${tildeImport.tildeImport} ${tildeUse.tildeUse} ${pkgUse.pkgUse} ${pkgImport.pkgImport}`} title={title} />;',
        '}',
        '',
      ].join('\n'),
    });
    const modules = ['TildeImport', 'TildeUse', 'PkgUse', 'PkgImport'];

    const { result, messages, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(messages).toEqual([]);
    expect(await heftCompile(copy.root, modules.map((name) => `${COMPONENTS}/${name}.module.scss`))).toEqual([]);
    expect(renderedClassName(bundle('single-web-part'))).toBe(
      modules.map((name) => heftClassName(copy.root, `${COMPONENTS}/${name}.module.scss`, `${name[0]?.toLowerCase()}${name.slice(1)}`)).join(' '),
    );
    expect(copy.read(`lib/${path.relative('src', COMPONENTS)}/PkgUse.module.scss.css`)).toContain('color: #107c10');
    const root = realpathSync(copy.root);
    expect(result.fileDependencies).toEqual(
      expect.arrayContaining([path.join(root, hiddenPackage, 'dist/sass/_tokens.scss'), path.join(root, hiddenPackage, 'node_modules/inner-sass/_vars.scss')]),
    );
  }, 60_000);

  it('reports Sass deprecations that config/sass.json does not silence', async () => {
    const copy = styledFixture({ 'config/sass.json': heftSassJson });

    const { result } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(result.warnings.join('\n')).toMatch(/@import/);
  }, 60_000);

  it('uses loadPaths from config/sass.json', async () => {
    const copy = styledFixture({
      'config/sass.json': { ...heftSassJson, silenceDeprecations: ['import'], loadPaths: ['src/styles'] },
      'src/styles/_shared.scss': '$shared-margin: 3px;\n',
      [`${COMPONENTS}/Legacy.module.sass`]: "@use 'shared'\n.legacy\n  margin: shared.$shared-margin\n",
    });

    const { result, bundle } = await copy.compile();

    expect(result.errors).toEqual([]);
    expect(bundle('single-web-part')).toMatch(/margin:3px/);
  }, 60_000);
});
