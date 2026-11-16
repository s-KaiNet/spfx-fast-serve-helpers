import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { Logger } from '../../logger.js';
import { createScssTypings } from './scssTypings.js';

const fixture = fileURLToPath(new URL('../../../test/fixtures/scss-typings/', import.meta.url));
const workspace = fileURLToPath(new URL('../../../node_modules/.cache/fast-serve-tests/', import.meta.url));

const cardTypings = [
  'declare interface IStyles {',
  '  accentColor: string;',
  '  card: string;',
  '  title: string;',
  '  "kebab-name": string;',
  '}',
  'declare const styles: IStyles;',
  'export default styles;',
].join('\n');

const createdRoots: string[] = [];

afterEach(() => {
  for (const root of createdRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function copyFixture(): string {
  mkdirSync(workspace, { recursive: true });
  const root = mkdtempSync(path.join(workspace, 'scss-typings-'));
  createdRoots.push(root);
  cpSync(fixture, root, { recursive: true });
  return root;
}

function recordingLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  const record = (message: string) => {
    messages.push(message);
  };
  return { messages, info: record, warn: record, error: record };
}

const typingsOf = (root: string, sourcePath: string) => path.join(root, 'temp/sass-ts', `${sourcePath}.d.ts`);
const readTypings = (root: string, sourcePath: string) => readFileSync(typingsOf(root, sourcePath), 'utf8');

describe('scss typings', () => {
  it('generates heft-compatible typings for every stylesheet under src', async () => {
    const root = copyFixture();
    const logger = recordingLogger();
    const typings = createScssTypings({ root, logger });

    await typings.generateAll();

    expect(readTypings(root, 'components/Card.module.scss')).toBe(cardTypings);
    expect(readTypings(root, 'components/Plain.scss')).toBe('export {};');
    expect(readTypings(root, 'app.global.scss')).toBe('export {};');
    expect(existsSync(typingsOf(root, 'styles/_palette.scss'))).toBe(false);
    expect(existsSync(typingsOf(root, 'excluded/Ignored.module.scss'))).toBe(false);
    expect(logger.messages).toEqual([]);
  });

  it('regenerates the typings of a changed module', async () => {
    const root = copyFixture();
    const typings = createScssTypings({ root, logger: recordingLogger() });
    await typings.generateAll();

    const card = path.join(root, 'src/components/Card.module.scss');
    writeFileSync(card, `${readFileSync(card, 'utf8')}\n.added {\n  color: red;\n}\n`);
    await typings.fileChanged(card);

    expect(readTypings(root, 'components/Card.module.scss')).toContain('  added: string;');
  });

  it('regenerates the consumers of a changed partial', async () => {
    const root = copyFixture();
    const typings = createScssTypings({ root, logger: recordingLogger() });
    await typings.generateAll();

    const palette = path.join(root, 'src/styles/_palette.scss');
    writeFileSync(palette, `${readFileSync(palette, 'utf8')}\n.fromPartial {\n  color: red;\n}\n`);
    await typings.fileChanged(palette);

    expect(readTypings(root, 'components/Card.module.scss')).toContain('  fromPartial: string;');
  });

  it('generates typings for a new module and removes them with the module', async () => {
    const root = copyFixture();
    const typings = createScssTypings({ root, logger: recordingLogger() });
    await typings.generateAll();

    const added = path.join(root, 'src/components/Added.module.scss');
    writeFileSync(added, '.fresh {\n  color: red;\n}\n');
    await typings.fileChanged(added);
    expect(readTypings(root, 'components/Added.module.scss')).toContain('  fresh: string;');

    rmSync(added);
    await typings.fileRemoved(added);
    expect(existsSync(typingsOf(root, 'components/Added.module.scss'))).toBe(false);
  });

  it('batches changes that arrive while a compilation is running', async () => {
    const root = copyFixture();
    const typings = createScssTypings({ root, logger: recordingLogger() });
    const card = path.join(root, 'src/components/Card.module.scss');
    const plain = path.join(root, 'src/components/Plain.scss');

    const initial = typings.generateAll();
    writeFileSync(card, '.renamed {\n  color: red;\n}\n');
    writeFileSync(plain, '.nowModule {\n  color: red;\n}\n');
    void typings.fileChanged(card);
    void typings.fileChanged(plain);
    await initial;
    await typings.settled();

    expect(readTypings(root, 'components/Card.module.scss')).toContain('  renamed: string;');
    expect(readTypings(root, 'components/Plain.scss')).toContain('  nowModule: string;');
  });

  it('ignores files that are not stylesheets under src or are excluded', async () => {
    const root = copyFixture();
    const typings = createScssTypings({ root, logger: recordingLogger() });

    await typings.fileChanged(path.join(root, 'src/components/Card.tsx'));
    await typings.fileChanged(path.join(root, 'lib/components/Card.module.scss'));
    await typings.fileChanged(path.join(root, 'src/excluded/Ignored.module.scss'));

    expect(existsSync(path.join(root, 'temp'))).toBe(false);
  });

  it('reports Sass errors and keeps working', async () => {
    const root = copyFixture();
    const logger = recordingLogger();
    const typings = createScssTypings({ root, logger });
    await typings.generateAll();

    const card = path.join(root, 'src/components/Card.module.scss');
    writeFileSync(card, '.broken {\n  color: $missing;\n}\n');
    await typings.fileChanged(card);
    expect(logger.messages.join('\n')).toMatch(/Card\.module\.scss.*Undefined variable/s);
    expect(readTypings(root, 'components/Card.module.scss')).toBe(cardTypings);

    writeFileSync(card, '.fixed {\n  color: red;\n}\n');
    await typings.fileChanged(card);
    expect(readTypings(root, 'components/Card.module.scss')).toContain('  fixed: string;');
  });

  it('warns once and does nothing when the Sass configuration is invalid', async () => {
    const root = copyFixture();
    writeFileSync(path.join(root, 'config/sass.json'), JSON.stringify({ exportAsDefault: 'yes' }));
    const logger = recordingLogger();
    const typings = createScssTypings({ root, logger });

    await typings.generateAll();
    await typings.fileChanged(path.join(root, 'src/components/Card.module.scss'));

    expect(logger.messages).toHaveLength(1);
    expect(logger.messages[0]).toMatch(/^SCSS typings are not generated: .*sass\.json/s);
    expect(existsSync(path.join(root, 'temp'))).toBe(false);
  });
});
