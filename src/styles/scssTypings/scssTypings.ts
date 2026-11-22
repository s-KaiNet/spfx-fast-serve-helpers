import { existsSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import picomatch from 'picomatch';
import { glob } from 'tinyglobby';
import type { TypingsListener, TypingsUpdate } from '../../bundler/featureApi/index.js';
import type { Logger } from '../../shared/logger.js';
import type { SassConfiguration } from '../../project/index.js';
import { errorMessage } from '../../shared/errors.js';
import { isInside, toPosix } from '../../shared/paths.js';
import { createHeftSassTypings, type HeftSassTypings } from './heftSass.js';
import { createStagedTypings, type StagedTypings } from './stagedTypings.js';

export interface ScssTypings {
  generateAll(): Promise<void>;
  fileChanged(file: string): Promise<void>;
  fileRemoved(file: string): Promise<void>;
  settled(): Promise<void>;
}

export interface ScssTypingsOptions {
  root: string;
  logger: Logger;
  sassConfiguration: () => Promise<SassConfiguration>;
  onTypingsUpdated?: TypingsListener;
}

interface ActiveTypings extends HeftSassTypings {
  staged: StagedTypings;
  configuration: SassConfiguration;
  fromCache: boolean;
}

interface Batch {
  files: Set<string>;
  startup: boolean;
}

export const SCSS_TYPINGS_CACHE_FOLDER = path.join('temp', 'fast-serve', 'sass-typings');

const isPartial = (file: string) => path.basename(file).startsWith('_');

export function createScssTypings({ root, logger, sassConfiguration, onTypingsUpdated }: ScssTypingsOptions): ScssTypings {
  const cacheFolder = path.join(root, SCSS_TYPINGS_CACHE_FOLDER);
  const stagingFolder = path.join(cacheFolder, 'dts');
  let active: Promise<ActiveTypings | undefined> | undefined;
  let tail: Promise<void> = Promise.resolve();
  let queuedBatch: Batch | undefined;

  const report = (update: TypingsUpdate) => {
    if (update.written.length > 0 || update.removed.length > 0) onTypingsUpdated?.(update);
  };

  async function activate(configuration: SassConfiguration, { fresh }: { fresh: boolean }): Promise<ActiveTypings> {
    const fromCache = !fresh && existsSync(stagingFolder);
    if (!fromCache) await rm(cacheFolder, { recursive: true, force: true });
    const typings = await createHeftSassTypings(root, logger, configuration, { stagingFolder, cacheFolder });
    const staged = createStagedTypings({ sourceFolder: typings.processor.sourceFolderPath, stagingFolder, typingsFolders: typings.typingsFolders });
    await staged.changedSinceLastScan();
    return { ...typings, staged, configuration, fromCache };
  }

  const ready = () =>
    (active ??= sassConfiguration()
      .then((configuration) => activate(configuration, { fresh: false }))
      .catch((error: unknown) => {
        logger.warn(`SCSS typings are not generated: ${errorMessage(error)}`);
        return undefined;
      }));

  function enqueue(task: (typings: ActiveTypings) => Promise<void>): Promise<void> {
    tail = tail
      .then(async () => {
        const typings = await ready();
        if (typings) await task(typings);
      })
      .catch((error: unknown) => {
        logger.error(`SCSS typings: ${errorMessage(error)}`);
      });
    return tail;
  }

  const stagedFilesOf = (typings: ActiveTypings, files: Iterable<string>) => [...files].filter((file) => !isPartial(file)).map((file) => typings.staged.stagedFileOf(file));

  async function compileAtStartup(typings: ActiveTypings, files: Set<string>): Promise<void> {
    await typings.processor.compileFilesAsync(files);
    let current = typings;
    if (current.fromCache && stagedFilesOf(current, files).some((file) => !existsSync(file))) {
      current = await activate(current.configuration, { fresh: true });
      active = Promise.resolve(current);
      await current.processor.compileFilesAsync(files);
    }
    await current.staged.changedSinceLastScan();
    report(await current.staged.publish(stagedFilesOf(current, files).filter((file) => existsSync(file))));
  }

  async function compileEdits(typings: ActiveTypings, files: Set<string>): Promise<void> {
    await typings.processor.compileFilesAsync(files);
    const changed = await typings.staged.changedSinceLastScan();
    const requested = stagedFilesOf(typings, files).filter((file) => existsSync(file));
    report(await typings.staged.publish([...new Set([...changed, ...requested])]));
  }

  function compile(files: Iterable<string>, { startup }: { startup: boolean }): Promise<void> {
    if (queuedBatch) {
      for (const file of files) queuedBatch.files.add(file);
      queuedBatch.startup ||= startup;
      return tail;
    }
    const batch: Batch = { files: new Set(files), startup };
    queuedBatch = batch;
    return enqueue(async (typings) => {
      queuedBatch = undefined;
      if (batch.files.size === 0) return;
      await (batch.startup ? compileAtStartup(typings, batch.files) : compileEdits(typings, batch.files));
    });
  }

  async function settled(): Promise<void> {
    const observed = tail;
    await observed;
    if (observed !== tail) await settled();
  }

  async function isTypingsSource(file: string): Promise<boolean> {
    const typings = await ready();
    if (!typings) return false;
    const { processor } = typings;
    if (!isInside(processor.sourceFolderPath, file)) return false;
    const relative = toPosix(path.relative(processor.sourceFolderPath, file));
    return picomatch.isMatch(relative, processor.inputFileGlob) && !picomatch.isMatch(relative, processor.ignoredFileGlobs ?? []);
  }

  return {
    async generateAll() {
      const typings = await ready();
      if (!typings) return;
      const { processor } = typings;
      const files = await glob(processor.inputFileGlob, {
        cwd: processor.sourceFolderPath,
        ignore: processor.ignoredFileGlobs ?? [],
        absolute: true,
        expandDirectories: false,
      });
      await compile(files.map((file) => path.resolve(file)), { startup: true });
    },
    async fileChanged(file) {
      if (await isTypingsSource(file)) await compile([path.resolve(file)], { startup: false });
    },
    async fileRemoved(file) {
      if (!(await isTypingsSource(file))) return;
      const removed = path.resolve(file);
      queuedBatch?.files.delete(removed);
      await enqueue(async ({ staged }) => {
        report(await staged.remove(removed));
      });
    },
    settled,
  };
}
