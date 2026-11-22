import { readFileSync } from 'node:fs';
import type { Compilation, Compiler, Module, RspackPluginInstance } from '@rspack/core';
import { isInside } from '../shared/paths.js';

const PLUGIN_NAME = 'fast-serve:type-only-names';
const MISSING_EXPORT = /export '([^']+)' \((?:reexported|imported) as '[^']+'\) was not found in '([^']+)'/;
const NODE_MODULES = /[\\/]node_modules[\\/]/;

export function declaresOnlyType(source: string, name: string): boolean {
  const escaped = name.replaceAll('$', '\\$');
  const typeDeclaration = new RegExp(`\\b(?:interface|type)\\s+${escaped}(?![\\w$])`);
  const valueDeclaration = new RegExp(`\\b(?:class|const|let|var|function|enum|namespace)\\s+${escaped}(?![\\w$])`);
  return typeDeclaration.test(source) && !valueDeclaration.test(source);
}

export class TypeOnlyNamesPlugin implements RspackPluginInstance {
  readonly #roots: readonly string[];

  constructor(roots: string | readonly string[]) {
    this.#roots = typeof roots === 'string' ? [roots] : roots;
  }

  apply(compiler: Compiler): void {
    compiler.hooks.thisCompilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processWarnings.tap(PLUGIN_NAME, (warnings) => warnings.filter((warning) => !this.#isTypeOnlyName(compilation, warning)));
    });
  }

  #isTypeOnlyName(compilation: Compilation, warning: Error & { module?: Module | null }): boolean {
    const match = MISSING_EXPORT.exec(warning.message);
    const importer = warning.module;
    if (!match || !importer || !this.#isProjectFile(importer.nameForCondition())) return false;
    const [, name = '', request] = match;
    const connection = compilation.moduleGraph.getOutgoingConnections(importer).find(({ dependency }) => dependency.request === request);
    const target = connection?.module?.nameForCondition();
    if (target === undefined || !this.#isProjectFile(target)) return false;
    try {
      return declaresOnlyType(readFileSync(target, 'utf8'), name);
    } catch {
      return false;
    }
  }

  #isProjectFile(file: string | undefined): file is string {
    return file !== undefined && this.#roots.some((root) => isInside(root, file)) && !NODE_MODULES.test(file);
  }
}
