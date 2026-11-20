import path from 'node:path';
import { OPTIONS_FILE } from '../config/index.js';
import { localExternalFiles } from '../externals/index.js';
import { extendFileCandidates, projectRelative } from '../extend/index.js';
import type { SpfxProject } from '../project/index.js';
import type { FileChange } from './fileWatcher.js';

export interface RestartTriggers {
  files: string[];
  describe(change: FileChange): string;
}

export function restartTriggers(project: SpfxProject, extendFile: string | undefined, extendDependencies: readonly string[]): RestartTriggers {
  const { root } = project;
  const liveFiles = new Set(localExternalFiles(project.configExternals().values()).map(({ file }) => path.resolve(file)));
  const candidates = new Set(extendFileCandidates(root));
  const importedByExtend = new Set(extendDependencies.map((file) => path.resolve(file)).filter((file) => !candidates.has(file)));
  const files = [
    ...project.modelFiles().map((file) => path.resolve(file)).filter((file) => !liveFiles.has(file)),
    path.join(root, OPTIONS_FILE),
    ...candidates,
    ...importedByExtend,
  ];
  return {
    files: [...new Set(files)],
    describe({ file, exists }) {
      const relative = projectRelative(root, file);
      if (candidates.has(file)) {
        if (file === extendFile) return exists ? `${relative} changed` : `${relative} was removed`;
        return exists ? `${relative} found` : `${relative} was removed`;
      }
      if (importedByExtend.has(file)) return `${relative} (imported by ${projectRelative(root, extendFile ?? file)}) ${exists ? 'changed' : 'was removed'}`;
      return `${relative} ${exists ? 'changed' : 'was removed'}`;
    },
  };
}

export function restartReason(triggers: RestartTriggers, changes: readonly FileChange[]): string {
  const [first, ...rest] = changes.map((change) => triggers.describe(change));
  const more = rest.length === 0 ? '' : ` (+${rest.length} more)`;
  return `${first ?? 'project files changed'}${more}, restarting fast-serve`;
}
