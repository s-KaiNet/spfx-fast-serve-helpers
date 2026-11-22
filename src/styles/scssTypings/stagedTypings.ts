import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { glob } from 'tinyglobby';
import type { TypingsUpdate } from '../../featureApi/index.js';
import { removeFileIfExists, writeFileIfChanged } from '../../shared/generatedFiles.js';

export interface StagedTypings {
  stagedFileOf(source: string): string;
  changedSinceLastScan(): Promise<string[]>;
  publish(stagedFiles: readonly string[]): Promise<TypingsUpdate>;
  remove(source: string): Promise<TypingsUpdate>;
}

export interface StagedTypingsFolders {
  sourceFolder: string;
  stagingFolder: string;
  typingsFolders: readonly string[];
}

export function createStagedTypings({ sourceFolder, stagingFolder, typingsFolders }: StagedTypingsFolders): StagedTypings {
  let lastScan = new Map<string, string>();

  const relativeTypingsPath = (source: string) => `${path.relative(sourceFolder, source)}.d.ts`;
  const publishedFilesOf = (relative: string) => typingsFolders.map((folder) => path.join(folder, relative));

  async function scan(): Promise<Map<string, string>> {
    const files = await glob('**/*.d.ts', { cwd: stagingFolder, absolute: true, expandDirectories: false });
    const versions = await Promise.all(
      files.map(async (file) => {
        const stats = await stat(file).catch(() => undefined);
        return [path.resolve(file), stats === undefined ? '' : `${stats.mtimeMs}:${stats.size}`] as const;
      }),
    );
    return new Map(versions.filter(([, version]) => version !== ''));
  }

  return {
    stagedFileOf: (source) => path.join(stagingFolder, relativeTypingsPath(source)),
    async changedSinceLastScan() {
      const current = await scan();
      const changed = [...current].filter(([file, version]) => lastScan.get(file) !== version).map(([file]) => file);
      lastScan = current;
      return changed;
    },
    async publish(stagedFiles) {
      const written = await Promise.all(
        stagedFiles.map(async (stagedFile) => {
          const content = await readFile(stagedFile, 'utf8');
          const targets = publishedFilesOf(path.relative(stagingFolder, stagedFile));
          const changed = await Promise.all(targets.map((target) => writeFileIfChanged(target, content)));
          return targets.filter((_, index) => changed[index]);
        }),
      );
      return { written: written.flat(), removed: [] };
    },
    async remove(source) {
      const targets = publishedFilesOf(relativeTypingsPath(source));
      const removed = await Promise.all(targets.map((target) => removeFileIfExists(target)));
      return { written: [], removed: targets.filter((_, index) => removed[index]) };
    },
  };
}
