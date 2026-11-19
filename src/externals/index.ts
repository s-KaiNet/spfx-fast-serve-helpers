import type { BuildContext } from '../rspack/context.js';
import type { ConfigContribution, PageReloader } from '../rspack/contribution.js';
import { DeepLibraryImportsPlugin } from './deepLibraryImports.js';
import { localExternalFiles, LocalExternalFilesPlugin } from './localExternalFiles.js';

export { deepLibraryImports, deepLibraryImportWarning, DeepLibraryImportsPlugin, type DeepLibraryImport } from './deepLibraryImports.js';
export { localExternalAssetName, localExternalFiles, LocalExternalFilesPlugin, type LocalExternalFile } from './localExternalFiles.js';

export function externalsContribution({ project, logger }: BuildContext): ConfigContribution {
  const libraries = project.libraries();
  const configExternals = project.configExternals();
  const reloaders: PageReloader[] = [];
  const localFiles = new LocalExternalFilesPlugin(localExternalFiles(configExternals.values()), () => {
    for (const reloader of reloaders) reloader.reloadPages();
  });
  const deepImports = new DeepLibraryImportsPlugin(libraries, (message) => {
    logger.warn(message);
  });
  return {
    externals: [...libraries.keys(), ...configExternals.keys()].toSorted(),
    plugins: [localFiles, deepImports],
    serverStarted: [
      (reloader) => {
        reloaders.push(reloader);
      },
    ],
  };
}
