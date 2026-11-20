import type { ConfigContribution, Feature, FeatureContext } from '../featureApi/index.js';
import { DeepLibraryImportsPlugin } from './deepLibraryImports.js';
import { localExternalFiles, LocalExternalFilesPlugin } from './localExternalFiles.js';

export { deepLibraryImports, deepLibraryImportWarning, DeepLibraryImportsPlugin, projectRelativePath, type DeepLibraryImport } from './deepLibraryImports.js';
export { localExternalAssetName, localExternalFiles, LocalExternalFilesPlugin, type LocalExternalFile } from './localExternalFiles.js';

export const externalsFeature: Feature = { name: 'externals', contribute: externalsContribution };

function externalsContribution({ root, project, logger, page }: FeatureContext): ConfigContribution {
  const libraries = project.libraries();
  const configExternals = project.configExternals();
  const localFiles = new LocalExternalFilesPlugin(localExternalFiles(configExternals.values()), () => {
    page.reloadPages();
  });
  const deepImports = new DeepLibraryImportsPlugin(
    libraries,
    root,
    (message) => {
      logger.warn(message);
    },
    project.codeRoots().map((codeRoot) => codeRoot.root),
  );
  return {
    externals: [...libraries.keys(), ...configExternals.keys()].toSorted(),
    plugins: [localFiles, deepImports],
  };
}
