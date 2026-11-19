import path from 'node:path';
import { NormalModule, type Compiler, type Module, type RspackPluginInstance } from '@rspack/core';
import type { SpfxLibrary } from '../project/index.js';

const PLUGIN_NAME = 'fast-serve:deep-library-imports';
const SCRIPT_FILE = /\.[cm]?js$/;

export interface DeepLibraryImport {
  request: string;
  packageName: string;
}

export function deepLibraryImports(modules: Iterable<Module>, libraries: ReadonlyMap<string, SpfxLibrary>): DeepLibraryImport[] {
  const libraryDirs = [...libraries.values()].map(({ packageName, packageDir }) => ({ packageName, prefix: packageDir + path.sep }));
  const found = new Map<string, DeepLibraryImport>();
  for (const module of modules) {
    if (!(module instanceof NormalModule) || !SCRIPT_FILE.test(module.resource)) continue;
    const library = libraryDirs.find(({ prefix }) => module.resource.startsWith(prefix));
    if (library && module.rawRequest.startsWith(`${library.packageName}/`)) {
      found.set(module.rawRequest, { request: module.rawRequest, packageName: library.packageName });
    }
  }
  return [...found.values()].toSorted((first, second) => first.request.localeCompare(second.request));
}

export function deepLibraryImportWarning({ request, packageName }: DeepLibraryImport): string {
  return (
    `"${request}" is a deep import into the SPFx library ${packageName}: it is bundled from node_modules like heft does, ` +
    `as a copy separate from the ${packageName} SharePoint loads; import from "${packageName}" to use SharePoint's instance`
  );
}

export class DeepLibraryImportsPlugin implements RspackPluginInstance {
  readonly #libraries: ReadonlyMap<string, SpfxLibrary>;
  readonly #warn: (message: string) => void;
  readonly #warned = new Set<string>();

  constructor(libraries: ReadonlyMap<string, SpfxLibrary>, warn: (message: string) => void) {
    this.#libraries = libraries;
    this.#warn = warn;
  }

  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
        for (const deepImport of deepLibraryImports(modules, this.#libraries)) {
          if (this.#warned.has(deepImport.request)) continue;
          this.#warned.add(deepImport.request);
          this.#warn(deepLibraryImportWarning(deepImport));
        }
      });
    });
  }
}
