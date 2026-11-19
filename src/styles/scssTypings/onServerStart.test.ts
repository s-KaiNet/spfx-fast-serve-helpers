import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { assetsContribution } from '../../assets/index.js';
import type { Logger } from '../../logger.js';
import { createProject } from '../../project/index.js';
import type { StartedServer } from '../../rspack/index.js';
import { scssTypingsOnServerStart } from './index.js';

const fixture = fileURLToPath(new URL('../../../test/fixtures/scss-typings/', import.meta.url));
const workspace = fileURLToPath(new URL('../../../node_modules/.cache/fast-serve-tests/', import.meta.url));

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function copyFixture(): string {
  mkdirSync(workspace, { recursive: true });
  const root = mkdtempSync(path.join(workspace, 'typings-watch-'));
  cpSync(fixture, root, { recursive: true });
  writeFileSync(path.join(root, 'config/static-asset-typings.json'), JSON.stringify({ fileExtensions: ['.png'] }));
  cleanups.push(() => {
    rmSync(root, { recursive: true, force: true });
  });
  return root;
}

const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };

const POLL = { timeout: 5000, interval: 25 };

function startedServer(): StartedServer {
  return {
    firstCompile: Promise.resolve(),
    reloadPages: () => undefined,
    onStop: (stopper) => {
      cleanups.unshift(stopper);
    },
  };
}

describe('typings while serving', () => {
  it('generates SCSS typings at start and updates them when stylesheets are added, edited and deleted', async () => {
    const root = copyFixture();
    const context = { root, logger: silentLogger, project: createProject(root, silentLogger), options: { origin: 'https://localhost:4433', locale: 'en-us', overlay: true } };
    const typingsOf = (file: string) => path.join(root, 'temp/sass-ts', `${file}.d.ts`);

    scssTypingsOnServerStart(context, path.join(root, 'src'))(startedServer());
    await expect.poll(() => existsSync(typingsOf('components/Card.module.scss')), POLL).toBe(true);

    const added = path.join(root, 'src/components/Added.module.scss');
    writeFileSync(added, '.fresh {\n  color: red;\n}\n');
    await expect.poll(() => existsSync(typingsOf('components/Added.module.scss')) && readFileSync(typingsOf('components/Added.module.scss'), 'utf8').includes('fresh: string;'), POLL).toBe(true);

    writeFileSync(added, '.renamed {\n  color: red;\n}\n');
    await expect.poll(() => readFileSync(typingsOf('components/Added.module.scss'), 'utf8').includes('renamed: string;'), POLL).toBe(true);

    rmSync(added);
    await expect.poll(() => !existsSync(typingsOf('components/Added.module.scss')), POLL).toBe(true);
  });

  it('writes static asset typings at start and for added assets', async () => {
    const root = copyFixture();
    const typingsOf = (file: string) => path.join(root, 'temp/static-asset-ts', `${file}.d.ts`);
    writeFileSync(path.join(root, 'src/logo.png'), 'png');
    const [hook] = assetsContribution({ root, logger: silentLogger }).serverStarted ?? [];

    hook?.(startedServer());
    await expect.poll(() => existsSync(typingsOf('logo.png')), POLL).toBe(true);

    writeFileSync(path.join(root, 'src/components/added.png'), 'png');
    await expect.poll(() => existsSync(typingsOf('components/added.png')), POLL).toBe(true);
  });
});
