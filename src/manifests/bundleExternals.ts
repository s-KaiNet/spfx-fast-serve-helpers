import { ExternalModule, type Compilation, type Compiler, type RspackPluginInstance } from '@rspack/core';

const PLUGIN_NAME = 'fast-serve:bundle-externals';

export class BundleExternals implements RspackPluginInstance {
  #requestsByBundle = new Map<string, string[]>();
  readonly #onBundleExternalsChanged: () => void;
  #markCompiled: () => void = () => undefined;
  readonly #compiled = new Promise<void>((resolve) => {
    this.#markCompiled = resolve;
  });

  constructor(onBundleExternalsChanged: () => void = () => undefined) {
    this.#onBundleExternalsChanged = onBundleExternalsChanged;
  }

  apply(compiler: Compiler): void {
    let compiledBefore = false;
    compiler.hooks.done.tap(PLUGIN_NAME, (stats) => {
      if (stats.hasErrors() && compiledBefore) return;
      const previous = this.#requestsByBundle;
      this.#requestsByBundle = externalRequestsByEntry(stats.compilation);
      if (compiledBefore && !sameRequests(previous, this.#requestsByBundle)) this.#onBundleExternalsChanged();
      compiledBefore = true;
      this.#markCompiled();
    });
    compiler.hooks.failed.tap(PLUGIN_NAME, () => {
      this.#markCompiled();
    });
  }

  whenCompiled(): Promise<void> {
    return this.#compiled;
  }

  requestsOf(bundleName: string): readonly string[] {
    return this.#requestsByBundle.get(bundleName) ?? [];
  }
}

export function externalRequestsByEntry(compilation: Compilation): Map<string, string[]> {
  const requestsByEntry = new Map<string, string[]>();
  for (const [name, entrypoint] of compilation.entrypoints) {
    const chunks = new Set(entrypoint.chunks.concat(entrypoint.chunks.flatMap((chunk) => chunk.getAllAsyncChunks())));
    const requests = new Set<string>();
    for (const chunk of chunks) {
      for (const module of compilation.chunkGraph.getChunkModules(chunk)) {
        if (module instanceof ExternalModule) requests.add(module.userRequest);
      }
    }
    requestsByEntry.set(name, [...requests].toSorted());
  }
  return requestsByEntry;
}

function sameRequests(first: ReadonlyMap<string, readonly string[]>, second: ReadonlyMap<string, readonly string[]>): boolean {
  if (first.size !== second.size) return false;
  for (const [bundle, requests] of first) {
    const other = second.get(bundle);
    if (other?.length !== requests.length || other.some((request, index) => request !== requests[index])) return false;
  }
  return true;
}
