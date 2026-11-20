import type { JsonObject } from '../utils/guards.js';
import { once } from './memo.js';
import { mergedCompilerOptions, readProjectTsconfig } from './tsconfig.js';
import { hasPathResolution, tsconfigPathsOf, type TsconfigPaths } from './tsconfigPaths.js';
import type { ProjectLogger } from './types.js';

export interface ProjectTsconfig {
  readonly files: () => readonly string[];
  readonly pathResolution: () => TsconfigPaths | undefined;
  readonly compilerOptions: () => JsonObject;
}

export function projectTsconfig(tsconfigFile: string, logger: ProjectLogger): ProjectTsconfig {
  const tsconfig = once(() => readProjectTsconfig(tsconfigFile, logger));
  const paths = once(() => {
    const loaded = tsconfig();
    return loaded && tsconfigPathsOf(loaded);
  });
  return {
    files: () => tsconfig()?.files ?? [tsconfigFile],
    pathResolution: () => {
      const read = paths();
      return read && hasPathResolution(read) ? read : undefined;
    },
    compilerOptions: once(() => {
      const loaded = tsconfig();
      return loaded ? mergedCompilerOptions(loaded) : {};
    }),
  };
}
