import type { LocalLibrary } from '../project/index.js';
import type { ConfigContribution, Feature, FeatureContext } from '../bundler/featureApi/index.js';

export function localLibraryAliases(libraries: readonly LocalLibrary[]): Record<string, string> {
  const alias: Record<string, string> = {};
  for (const { packageName, entryFile, sourceDir } of libraries) {
    alias[`${packageName}$`] = entryFile;
    alias[`${packageName}/lib`] = sourceDir;
  }
  return alias;
}

export const localLibrariesFeature: Feature = { name: 'localLibraries', contribute: localLibrariesContribution };

function localLibrariesContribution({ project }: Pick<FeatureContext, 'project'>): ConfigContribution {
  return { alias: localLibraryAliases(project.localLibraries()) };
}
