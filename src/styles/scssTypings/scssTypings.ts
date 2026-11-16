import { glob, rm } from 'node:fs/promises';
import path from 'node:path';
import type { Logger } from '../../logger.js';
import { isInside, toPosix } from '../../utils/paths.js';
import { createHeftSassTypings, type HeftSassTypings } from './heftSass.js';

export interface ScssTypings {
  generateAll(): Promise<void>;
  fileChanged(file: string): Promise<void>;
  fileRemoved(file: string): Promise<void>;
  settled(): Promise<void>;
}

export interface ScssTypingsOptions {
  root: string;
  logger: Logger;
}

export function createScssTypings({ root, logger }: ScssTypingsOptions): ScssTypings {
  let heftSass: Promise<HeftSassTypings | undefined> | undefined;
  let tail: Promise<void> = Promise.resolve();
  let queuedBatch: Set<string> | undefined;

  const ready = () =>
    (heftSass ??= createHeftSassTypings(root, logger).catch((error: unknown) => {
      logger.warn(`SCSS typings are not generated: ${error instanceof Error ? error.message : String(error)}`);
      return undefined;
    }));

  function enqueue(task: (typings: HeftSassTypings) => Promise<void>): Promise<void> {
    tail = tail
      .then(async () => {
        const typings = await ready();
        if (typings) await task(typings);
      })
      .catch((error: unknown) => {
        logger.error(`SCSS typings: ${error instanceof Error ? error.message : String(error)}`);
      });
    return tail;
  }

  function compile(files: Iterable<string>): Promise<void> {
    if (queuedBatch) {
      for (const file of files) queuedBatch.add(file);
      return tail;
    }
    const batch = new Set(files);
    queuedBatch = batch;
    return enqueue(async ({ processor }) => {
      queuedBatch = undefined;
      if (batch.size > 0) await processor.compileFilesAsync(batch);
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
    return path.matchesGlob(relative, processor.inputFileGlob) && !(processor.ignoredFileGlobs ?? []).some((pattern) => path.matchesGlob(relative, pattern));
  }

  return {
    async generateAll() {
      const typings = await ready();
      if (!typings) return;
      const { processor } = typings;
      const files: string[] = [];
      for await (const file of glob(processor.inputFileGlob, { cwd: processor.sourceFolderPath, exclude: processor.ignoredFileGlobs ?? [] })) {
        files.push(path.resolve(processor.sourceFolderPath, file));
      }
      await compile(files);
    },
    async fileChanged(file) {
      if (await isTypingsSource(file)) await compile([path.resolve(file)]);
    },
    async fileRemoved(file) {
      if (!(await isTypingsSource(file))) return;
      const removed = path.resolve(file);
      queuedBatch?.delete(removed);
      await enqueue(async ({ processor, typingsFolders }) => {
        const relative = path.relative(processor.sourceFolderPath, removed);
        await Promise.all(typingsFolders.map((folder) => rm(path.join(folder, `${relative}.d.ts`), { force: true })));
      });
    },
    settled,
  };
}
