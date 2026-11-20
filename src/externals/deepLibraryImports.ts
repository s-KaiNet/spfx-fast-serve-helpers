import { realpathSync } from 'node:fs';
import path from 'node:path';
import { NormalModule, type Compiler, type Module, type ModuleGraph, type RspackPluginInstance } from '@rspack/core';
import type { SpfxLibrary } from '../project/index.js';

const PLUGIN_NAME = 'fast-serve:deep-library-imports';
const SCRIPT_FILE = /\.[cm]?js$/;

export interface DeepLibraryImport {
  request: string;
  packageName: string;
  importers: string[];
}

interface LibraryDir {
  packageName: string;
  prefix: string;
}

function realPath(file: string): string {
  try {
    return realpathSync(file);
  } catch {
    return file;
  }
}

function resourcePath(module: NormalModule): string {
  return module.resource.split('?')[0] ?? module.resource;
}

function codeRelativePath(file: string, codeRoot: string): string | undefined {
  const relative = path.relative(codeRoot, file);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return undefined;
  const segments = relative.split(path.sep);
  return segments.includes('node_modules') ? undefined : segments.join('/');
}

export function projectRelativePath(file: string, projectRoot: string, codeRoots: readonly string[] = [projectRoot]): string | undefined {
  const realFile = realPath(file);
  const inProject = codeRelativePath(realFile, projectRoot);
  if (inProject !== undefined) return inProject;
  if (!codeRoots.some((codeRoot) => codeRelativePath(realFile, realPath(codeRoot)) !== undefined)) return undefined;
  return path.relative(realPath(projectRoot), realFile).split(path.sep).join('/');
}

function deepLibraryOf(module: Module, libraryDirs: readonly LibraryDir[]): LibraryDir | undefined {
  if (!(module instanceof NormalModule) || !SCRIPT_FILE.test(module.resource)) return undefined;
  const library = libraryDirs.find(({ prefix }) => module.resource.startsWith(prefix));
  return library && module.rawRequest.startsWith(`${library.packageName}/`) ? library : undefined;
}

function projectImporters(module: Module, moduleGraph: ModuleGraph, projectRoot: string, codeRoots: readonly string[]): string[] {
  const importers = new Set<string>();
  for (const { originModule } of moduleGraph.getIncomingConnections(module)) {
    if (!(originModule instanceof NormalModule)) continue;
    const importer = projectRelativePath(resourcePath(originModule), projectRoot, codeRoots);
    if (importer !== undefined) importers.add(importer);
  }
  return [...importers];
}

export function deepLibraryImports(
  modules: Iterable<Module>,
  moduleGraph: ModuleGraph,
  libraries: ReadonlyMap<string, SpfxLibrary>,
  projectRoot: string,
  codeRoots: readonly string[] = [projectRoot],
): DeepLibraryImport[] {
  const libraryDirs = [...libraries.values()].map(({ packageName, packageDir }) => ({ packageName, prefix: packageDir + path.sep }));
  const realProjectRoot = realPath(projectRoot);
  const found = new Map<string, DeepLibraryImport>();
  for (const module of modules) {
    const library = deepLibraryOf(module, libraryDirs);
    if (!library || !(module instanceof NormalModule)) continue;
    const importers = projectImporters(module, moduleGraph, realProjectRoot, codeRoots);
    if (importers.length === 0) continue;
    const known = found.get(module.rawRequest)?.importers ?? [];
    found.set(module.rawRequest, { request: module.rawRequest, packageName: library.packageName, importers: [...new Set([...known, ...importers])].toSorted() });
  }
  return [...found.values()].toSorted((first, second) => first.request.localeCompare(second.request));
}

export function deepLibraryImportWarning({ request, packageName, importers }: DeepLibraryImport): string {
  const [first = '', ...others] = importers;
  const importer = others.length === 0 ? first : `${first} (and ${others.length} more ${others.length === 1 ? 'file' : 'files'})`;
  return (
    `${importer} imports "${request}", a deep import into the SPFx library ${packageName}: it is bundled as a separate copy, ` +
    `not the instance SharePoint loads; import from "${packageName}" instead`
  );
}

export class DeepLibraryImportsPlugin implements RspackPluginInstance {
  readonly #libraries: ReadonlyMap<string, SpfxLibrary>;
  readonly #projectRoot: string;
  readonly #warn: (message: string) => void;
  readonly #warned = new Set<string>();
  readonly #codeRoots: readonly string[];

  constructor(libraries: ReadonlyMap<string, SpfxLibrary>, projectRoot: string, warn: (message: string) => void, codeRoots: readonly string[] = [projectRoot]) {
    this.#libraries = libraries;
    this.#projectRoot = projectRoot;
    this.#warn = warn;
    this.#codeRoots = codeRoots;
  }

  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.finishModules.tap(PLUGIN_NAME, (modules) => {
        for (const deepImport of deepLibraryImports(modules, compilation.moduleGraph, this.#libraries, this.#projectRoot, this.#codeRoots)) {
          const message = deepLibraryImportWarning(deepImport);
          if (this.#warned.has(message)) continue;
          this.#warned.add(message);
          this.#warn(message);
        }
      });
    });
  }
}
