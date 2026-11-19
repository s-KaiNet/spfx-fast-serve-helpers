import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyCompileFixture, evaluateAmd, type FixtureCopy } from '../testing/compileKit.js';
import { createHeftTerminal } from '../utils/heftProject.js';

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
  return `${className}_${createHmac('sha1', cssFile).update(readFileSync(cssFile, 'utf8')).digest('hex').slice(0, 8)}`;
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
