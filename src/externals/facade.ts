import type { SpfxLibraryReference } from '../runtime/contracts.js';

export const FAST_SERVE_GLOBAL = '__spfxFastServe';

const LIBRARY_LOADER = `window.${FAST_SERVE_GLOBAL}`;
const MISSING_LOADER_ERROR = JSON.stringify(
  '[fast-serve] SPFx libraries can only be loaded inside a SharePoint page that loaded the fast-serve bundle shim.',
);

export function renderEsmFacade(library: SpfxLibraryReference, exportNames: readonly string[]): string {
  return [
    `if (!${LIBRARY_LOADER}) throw new Error(${MISSING_LOADER_ERROR});`,
    `const library = await ${LIBRARY_LOADER}.loadLibrary(${JSON.stringify(library)});`,
    'export default (library.default !== undefined ? library.default : library);',
    ...exportNames.map(
      (exportName, index) => `const __e${index} = library[${JSON.stringify(exportName)}];\nexport { __e${index} as ${exportName} };`,
    ),
    '',
  ].join('\n');
}

export function renderCommonJsFacade(library: SpfxLibraryReference): string {
  return `module.exports = ${LIBRARY_LOADER}.loadedLibrary(${JSON.stringify(library)});\n`;
}

export function renderChunkPreload(libraries: readonly SpfxLibraryReference[]): string {
  return `await ${LIBRARY_LOADER}.preloadLibraries(${JSON.stringify(libraries)});`;
}
