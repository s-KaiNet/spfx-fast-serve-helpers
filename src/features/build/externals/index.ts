import type { ConfigContribution, Feature, FeatureContext } from '../../../bundler/featureApi/index.js';
import { DeepLibraryImportsPlugin } from './deepLibraryImports.js';
import { heftLocalExternalsMiddleware, localExternalFiles, LocalExternalFilesPlugin } from './localExternalFiles.js';

export { deepLibraryImports, deepLibraryImportWarning, DeepLibraryImportsPlugin, projectRelativePath, type DeepLibraryImport } from './deepLibraryImports.js';
export { heftLocalExternalFile, heftLocalExternalsMiddleware, localExternalAssetName, localExternalFiles, LocalExternalFilesPlugin, type LocalExternalFile } from './localExternalFiles.js';

export const externalsFeature: Feature = { name: 'externals', contribute: externalsContribution };

function externalsContribution({ root, project, logger, page }: FeatureContext): ConfigContribution {
  const libraries = project.libraries();
  const configExternals = project.configExternals();
  const files = localExternalFiles(configExternals.values());
  const localFiles = new LocalExternalFilesPlugin(files, () => {
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
    middlewares: [heftLocalExternalsMiddleware(files)],
  };
}
