import type { LocalLibrary } from '../project/index.js';
import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution } from '../rspack/contribution.js';

export function localLibraryAliases(libraries: readonly LocalLibrary[]): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const { packageName, entryFile, sourceDir } of libraries) {
    alias[`${packageName}$`] = entryFile;
    alias[`${packageName}/lib`] = sourceDir;
  }
  return alias;
}

export function localLibrariesContribution({ project }: Pick<BuildContext, 'project'>): ConfigContribution {
  return { alias: localLibraryAliases(project.localLibraries()) };
}
