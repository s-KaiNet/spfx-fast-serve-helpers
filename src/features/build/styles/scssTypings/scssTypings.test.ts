import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { TypingsUpdate } from '../../../../bundler/featureApi/index.js';
import type { Logger } from '../../../../shared/logger.js';
import { loadSassConfiguration } from '../../../../project/sassConfiguration.js';
import { createScssTypings as createTypings } from './scssTypings.js';

const fixture = fileURLToPath(new URL('../../../../../test/fixtures/scss-typings/', import.meta.url));
const workspace = fileURLToPath(new URL('../../../../../node_modules/.cache/fast-serve-tests/', import.meta.url));

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

function createScssTypings({ root, logger, updates }: { root: string; logger: Logger; updates?: TypingsUpdate[] }) {
  return createTypings({
    root,
    logger,
    sassConfiguration: () => loadSassConfiguration(root, logger),
    onTypingsUpdated: (update) => updates?.push(update),
  });
}

const PAST = new Date('2020-01-01T00:00:00Z');

function ageTypings(root: string, sourcePaths: readonly string[]): void {
  for (const sourcePath of sourcePaths) utimesSync(typingsOf(root, sourcePath), PAST, PAST);
}

const typingsAged = (root: string, sourcePath: string) => statSync(typingsOf(root, sourcePath)).mtimeMs === PAST.getTime();

const PUBLISHED = ['components/Card.module.scss', 'components/Plain.scss', 'app.global.scss'];

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

  it('reports the typings written at the first start and keeps unchanged typings untouched across restarts', async () => {
    const root = copyFixture();
    const firstUpdates: TypingsUpdate[] = [];
    await createScssTypings({ root, logger: recordingLogger(), updates: firstUpdates }).generateAll();
    expect(firstUpdates.flatMap(({ written }) => written).toSorted()).toEqual(PUBLISHED.map((sourcePath) => typingsOf(root, sourcePath)).toSorted());
    ageTypings(root, PUBLISHED);
    const stagedCard = path.join(root, 'temp/fast-serve/sass-typings/dts/components/Card.module.scss.d.ts');
    utimesSync(stagedCard, PAST, PAST);

    const restart = async (remaining: number): Promise<void> => {
      if (remaining === 0) return;
      const updates: TypingsUpdate[] = [];
      const logger = recordingLogger();
      await createScssTypings({ root, logger, updates }).generateAll();
      expect(updates).toEqual([]);
      expect(logger.messages).toEqual([]);
      await restart(remaining - 1);
    };
    await restart(3);
    expect(PUBLISHED.filter((sourcePath) => !typingsAged(root, sourcePath))).toEqual([]);
    expect(statSync(stagedCard).mtimeMs).toBe(PAST.getTime());
  });

  it('updates only the typing of a module changed while fast-serve was not running', async () => {
    const root = copyFixture();
    await createScssTypings({ root, logger: recordingLogger() }).generateAll();
    ageTypings(root, PUBLISHED);
    const card = path.join(root, 'src/components/Card.module.scss');
    writeFileSync(card, `${readFileSync(card, 'utf8')}\n.offline {\n  color: red;\n}\n`);

    const updates: TypingsUpdate[] = [];
    await createScssTypings({ root, logger: recordingLogger(), updates }).generateAll();

    expect(updates).toEqual([{ written: [typingsOf(root, 'components/Card.module.scss')], removed: [] }]);
    expect(readTypings(root, 'components/Card.module.scss')).toContain('  offline: string;');
    expect(PUBLISHED.filter((sourcePath) => !typingsAged(root, sourcePath))).toEqual(['components/Card.module.scss']);
  });

  it('restores deleted typings at start, also when the typings cache lost them', async () => {
    const root = copyFixture();
    await createScssTypings({ root, logger: recordingLogger() }).generateAll();
    rmSync(typingsOf(root, 'components/Plain.scss'));
    rmSync(path.join(root, 'temp/fast-serve/sass-typings/dts/components/Card.module.scss.d.ts'));
    rmSync(typingsOf(root, 'components/Card.module.scss'));
    ageTypings(root, ['app.global.scss']);

    const updates: TypingsUpdate[] = [];
    await createScssTypings({ root, logger: recordingLogger(), updates }).generateAll();

    expect(updates.flatMap(({ written }) => written).toSorted()).toEqual([typingsOf(root, 'components/Card.module.scss'), typingsOf(root, 'components/Plain.scss')].toSorted());
    expect(readTypings(root, 'components/Card.module.scss')).toBe(cardTypings);
    expect(readTypings(root, 'components/Plain.scss')).toBe('export {};');
    expect(typingsAged(root, 'app.global.scss')).toBe(true);
  });

  it('writes and reports a typing on edits only when its content changes', async () => {
    const root = copyFixture();
    const updates: TypingsUpdate[] = [];
    const typings = createScssTypings({ root, logger: recordingLogger(), updates });
    await typings.generateAll();
    ageTypings(root, PUBLISHED);
    updates.length = 0;

    const card = path.join(root, 'src/components/Card.module.scss');
    writeFileSync(card, readFileSync(card, 'utf8').replace(/color: [^;]+;/, 'color: rebeccapurple;'));
    await typings.fileChanged(card);
    expect(updates).toEqual([]);
    expect(typingsAged(root, 'components/Card.module.scss')).toBe(true);

    writeFileSync(card, `${readFileSync(card, 'utf8')}\n.added {\n  color: red;\n}\n`);
    await typings.fileChanged(card);
    expect(updates).toEqual([{ written: [typingsOf(root, 'components/Card.module.scss')], removed: [] }]);
    expect(PUBLISHED.filter((sourcePath) => !typingsAged(root, sourcePath))).toEqual(['components/Card.module.scss']);
  });

  it('reports added and removed modules and restores a module added back with the same content', async () => {
    const root = copyFixture();
    const updates: TypingsUpdate[] = [];
    const typings = createScssTypings({ root, logger: recordingLogger(), updates });
    await typings.generateAll();
    updates.length = 0;

    const added = path.join(root, 'src/components/Added.module.scss');
    writeFileSync(added, '.fresh {\n  color: red;\n}\n');
    await typings.fileChanged(added);
    rmSync(added);
    await typings.fileRemoved(added);
    writeFileSync(added, '.fresh {\n  color: red;\n}\n');
    await typings.fileChanged(added);

    const typing = typingsOf(root, 'components/Added.module.scss');
    expect(updates).toEqual([
      { written: [typing], removed: [] },
      { written: [], removed: [typing] },
      { written: [typing], removed: [] },
    ]);
    expect(readFileSync(typing, 'utf8')).toContain('  fresh: string;');
  });

  it('reports a Sass error again at a cached start', async () => {
    const root = copyFixture();
    const card = path.join(root, 'src/components/Card.module.scss');
    writeFileSync(card, '.broken {\n  color: $missing;\n}\n');
    await createScssTypings({ root, logger: recordingLogger() }).generateAll();

    const logger = recordingLogger();
    await createScssTypings({ root, logger }).generateAll();
    expect(logger.messages.join('\n')).toMatch(/Card\.module\.scss.*Undefined variable/s);
  });
});
