import { appendFileSync, cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Compiler, RspackPluginInstance, Stats } from '@rspack/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { resolveOptions } from '../config/options.js';
import type { Logger } from '../shared/logger.js';
import { createProject } from '../project/index.js';
import { freePort, selfSignedCertificate } from '../testing/devServerKit.js';
import { startDevServer, type RunningDevServer } from './devServer.js';

const fixture = fileURLToPath(new URL('../../test/fixtures/compile', import.meta.url));
const TYPE_ONLY_FILE = 'src/webparts/hello/components/IHelloProps.ts';
const COMPONENT = 'src/webparts/hello/components/Hello.tsx';

class TypeOnlyFilesWatcher implements RspackPluginInstance {
  compiler: Compiler | undefined;
  readonly #waiters: ((stats: Stats) => void)[] = [];

  constructor(private readonly files: readonly string[]) {}

  apply(compiler: Compiler): void {
    this.compiler = compiler;
    compiler.hooks.afterCompile.tap('type-only-files', (compilation) => {
      for (const file of this.files) compilation.fileDependencies.add(file);
    });
    compiler.hooks.afterDone.tap('type-only-files', (stats) => {
      for (const resolve of this.#waiters.splice(0)) resolve(stats);
    });
  }

  nextCompile(): Promise<Stats> {
    return new Promise((resolve) => {
      this.#waiters.push(resolve);
    });
  }
}

describe('rebuilds that change no module', () => {
  let root: string;
  let server: RunningDevServer;
  let watcher: TypeOnlyFilesWatcher;
  const messages: string[] = [];
  const rebuiltLines = () => messages.filter((message) => message.startsWith('info: rebuilt'));

  beforeAll(async () => {
    root = mkdtempSync(path.join(tmpdir(), 'fast-serve-quiet-rebuilds-'));
    cpSync(fixture, root, { recursive: true });
    const logger: Logger = {
      info: (message) => messages.push(`info: ${message}`),
      warn: (message) => messages.push(`warn: ${message}`),
      error: (message) => messages.push(`error: ${message}`),
    };
    const project = createProject(root, logger);
    const options = resolveOptions({ cli: { typeCheck: false, port: await freePort() }, defaults: project.serveConfig() }, {});
    watcher = new TypeOnlyFilesWatcher([path.join(root, TYPE_ONLY_FILE)]);
    server = await startDevServer({
      setup: { root, project, options },
      logger,
      https: selfSignedCertificate(root),
      outputPath: path.join(root, 'out'),
      persistentCache: false,
      extend: { file: path.join(root, 'fast-serve/rspack.extend.mjs'), config: { plugins: [watcher] }, dependencies: [] },
    });
  }, 60_000);

  afterAll(async () => {
    await server.close();
    rmSync(root, { recursive: true, force: true });
  });

  async function rebuildAfter(change: () => void): Promise<Stats> {
    messages.length = 0;
    const compiled = watcher.nextCompile();
    change();
    return compiled;
  }

  it('prints nothing when a watched file outside the module graph is saved', async () => {
    const stats = await rebuildAfter(() => {
      appendFileSync(path.join(root, TYPE_ONLY_FILE), '\nexport type Extra = string;\n');
    });
    expect(stats.compilation.builtModules.size).toBe(0);
    expect(rebuiltLines()).toEqual([]);
  }, 20_000);

  it('prints nothing when the compiler is invalidated without changes', async () => {
    await rebuildAfter(() => {
      watcher.compiler?.watching?.invalidate();
    });
    expect(rebuiltLines()).toEqual([]);
  }, 20_000);

  it('prints nothing when a module is saved without changes', async () => {
    const component = path.join(root, COMPONENT);
    const stats = await rebuildAfter(() => {
      writeFileSync(component, readFileSync(component));
    });
    expect(stats.compilation.builtModules.size).toBeGreaterThan(0);
    expect(rebuiltLines()).toEqual([]);
  }, 20_000);

  it('still prints rebuilds of changed modules, new errors and their fix', async () => {
    const component = path.join(root, COMPONENT);
    const source = readFileSync(component, 'utf8');
    await rebuildAfter(() => {
      writeFileSync(component, `${source}\n`);
    });
    expect(rebuiltLines()).toEqual([expect.stringMatching(new RegExp(`^info: rebuilt in \\d+ ms \\(${COMPONENT}\\)$`))]);

    await rebuildAfter(() => {
      writeFileSync(component, `${source}\nconst broken = = 1;\n`);
    });
    expect(rebuiltLines()).toEqual([expect.stringMatching(/: 1 error$/)]);

    const unchangedFailure = await rebuildAfter(() => {
      watcher.compiler?.watching?.invalidate();
    });
    expect(unchangedFailure.compilation.builtModules.size).toBe(1);
    expect(messages).toEqual([]);

    await rebuildAfter(() => {
      writeFileSync(component, `${source}\nconst broken = = 1;\n\n`);
    });
    expect(rebuiltLines()).toEqual([expect.stringMatching(new RegExp(`^info: rebuilt in \\d+ ms \\(${COMPONENT}\\): 1 error$`))]);

    await rebuildAfter(() => {
      writeFileSync(component, source);
    });
    expect(rebuiltLines()).toEqual([expect.stringMatching(new RegExp(`^info: rebuilt in \\d+ ms \\(${COMPONENT}\\)$`))]);
  }, 30_000);
});
