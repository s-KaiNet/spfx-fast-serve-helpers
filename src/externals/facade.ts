import type { SpfxLibraryReference } from '../runtime/contracts.js';

const FAST_SERVE_GLOBAL = '__spfxFastServe';

const LIBRARY_LOADER = `window.${FAST_SERVE_GLOBAL}`;
const MISSING_LOADER_ERROR = JSON.stringify(
  '[fast-serve] SPFx libraries and config.json externals can only be loaded inside a SharePoint page that loaded the fast-serve bundle shim.',
);

export interface ChunkPreloads {
  libraries: readonly SpfxLibraryReference[];
  externals: readonly string[];
}

export function renderEsmFacade(library: SpfxLibraryReference, exportNames: readonly string[]): string {
  return [
    `if (!${LIBRARY_LOADER}) throw new Error(${MISSING_LOADER_ERROR});`,
    `const library = await ${LIBRARY_LOADER}.loadLibrary(${JSON.stringify(library)});`,
    'export default (library.default !== undefined ? library.default : library);',
    ...renderNamedExports('library', exportNames),
    '',
  ].join('\n');
}

export function renderCommonJsFacade(library: SpfxLibraryReference): string {
  return `module.exports = ${LIBRARY_LOADER}.loadedLibrary(${JSON.stringify(library)});\n`;
}

export function renderExternalEsmFacade(name: string, exportNames: readonly string[]): string {
  return [
    `if (!${LIBRARY_LOADER}) throw new Error(${MISSING_LOADER_ERROR});`,
    `const external = await ${LIBRARY_LOADER}.loadExternal(${JSON.stringify(name)});`,
    'const hasExports = external !== null && external !== undefined;',
    'export default (hasExports && external.__esModule ? external.default : external);',
    ...renderNamedExports('external', exportNames, 'hasExports'),
    '',
  ].join('\n');
}

export function renderExternalCommonJsFacade(name: string): string {
  return `module.exports = ${LIBRARY_LOADER}.loadedExternal(${JSON.stringify(name)});\n`;
}

export function renderChunkPreload({ libraries, externals }: ChunkPreloads): string {
  const preloads = [
    ...(libraries.length > 0 ? [`${LIBRARY_LOADER}.preloadLibraries(${JSON.stringify(libraries)})`] : []),
    ...(externals.length > 0 ? [`${LIBRARY_LOADER}.preloadExternals(${JSON.stringify(externals)})`] : []),
  ];
  if (preloads.length === 0) return '';
  return preloads.length === 1 ? `await ${preloads[0]};` : `await Promise.all([${preloads.join(', ')}]);`;
}

function renderNamedExports(moduleVariable: string, exportNames: readonly string[], guard?: string): string[] {
  return exportNames.map((exportName, index) => {
    const read = `${moduleVariable}[${JSON.stringify(exportName)}]`;
    const value = guard === undefined ? read : `${guard} ? ${read} : undefined`;
    return `const __e${index} = ${value};\nexport { __e${index} as ${exportName} };`;
  });
}
