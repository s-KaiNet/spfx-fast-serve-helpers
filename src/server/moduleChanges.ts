import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { Compilation, Compiler, Module } from '@rspack/core';

export interface ModuleChanges {
  changedModules(compilation: Compilation): number;
}

interface ResourceModule extends Module {
  readonly resource?: string;
}

export function trackModuleChanges(compiler: Compiler): ModuleChanges {
  const knownOutputs = new Map<string, string>();
  let first = true;
  let previous: Compilation | undefined;
  compiler.hooks.watchRun.tap('fast-serve:module-changes', () => {
    const modifiedFiles = new Set(compiler.modifiedFiles ?? []);
    if (previous === undefined || modifiedFiles.size === 0) return;
    const modules = previous.modules as ReadonlySet<ResourceModule>;
    previous = undefined;
    rememberOutputs(knownOutputs, modules, modifiedFiles);
  });
  return {
    changedModules(compilation) {
      previous = compilation;
      if (first) {
        first = false;
        return compilation.builtModules.size;
      }
      let changed = 0;
      for (const module of compilation.builtModules as ReadonlySet<ResourceModule>) {
        const output = moduleOutput(module) ?? failedModuleInput(module);
        if (knownOutputs.get(module.identifier()) !== output) changed++;
        knownOutputs.set(module.identifier(), output);
      }
      return changed;
    },
  };
}

function rememberOutputs(knownOutputs: Map<string, string>, modules: ReadonlySet<ResourceModule>, modifiedFiles: ReadonlySet<string>): void {
  try {
    for (const module of modules) {
      if (module.resource === undefined || !modifiedFiles.has(module.resource) || knownOutputs.has(module.identifier())) continue;
      const output = moduleOutput(module);
      if (output !== undefined) knownOutputs.set(module.identifier(), output);
    }
  } catch {
    knownOutputs.clear();
  }
}

function failedModuleInput(module: ResourceModule): string {
  try {
    return `failed:${module.resource === undefined ? '' : createHash('sha1').update(readFileSync(module.resource)).digest('base64')}`;
  } catch {
    return 'failed:unreadable';
  }
}

function moduleOutput(module: Module): string | undefined {
  const source = module.originalSource();
  if (source === null) return undefined;
  const hash = createHash('sha1').update(source.buffer());
  const map = source.map();
  if (map) hash.update(JSON.stringify(map));
  return hash.digest('base64');
}
