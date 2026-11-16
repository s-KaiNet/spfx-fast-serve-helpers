type BundleShimConfig = import('./contracts.js').BundleShimConfig;
type ShimExternalsConfig = import('./contracts.js').ShimExternalsConfig;
type FastServeGlobal = import('./contracts.js').FastServeGlobal;

interface RequireJsLoadCallback {
  (value: unknown): void;
  error(error: unknown): void;
}
type ScopedRequire = (names: string[], onLoad: (...modules: unknown[]) => void, onError: (error: unknown) => void) => void;
interface RequireJsLoaderPlugin {
  load(name: string, scopedRequire: ScopedRequire, onload: RequireJsLoadCallback): void;
}

declare const __SPFX_BUNDLE__: BundleShimConfig;
declare function define(id: string, dependencies: string[], factory: (...modules: unknown[]) => unknown): void;

const shimConfig = __SPFX_BUNDLE__;
const shimLoaderPluginId = `spfx-fast-serve-loader:${shimConfig.bundleName}`;

function fastServeGlobal(): FastServeGlobal {
  const host = window as unknown as { __spfxFastServe?: FastServeGlobal };
  return (host.__spfxFastServe ??= { externals: {} });
}

function loadExternals(externals: ShimExternalsConfig, scopedRequire: ScopedRequire): Promise<void> {
  if (externals.preload.length === 0) return Promise.resolve();
  return new Promise((resolve, reject) => {
    scopedRequire(
      externals.preload,
      (...modules) => {
        const registry = fastServeGlobal().externals;
        externals.preload.forEach((name, index) => (registry[name] = modules[index]));
        resolve();
      },
      reject,
    );
  });
}

const shimLoaderPlugin: RequireJsLoaderPlugin = {
  load(entryPath, scopedRequire, onload) {
    loadExternals(shimConfig.externals, scopedRequire)
      .then(() => import(shimConfig.origin + entryPath))
      .then(onload, (error: unknown) => {
        console.error(`[fast-serve] failed to load bundle "${shimConfig.bundleName}" from ${shimConfig.origin}`, error);
        onload.error(error);
      });
  },
};

define(shimLoaderPluginId, [], () => shimLoaderPlugin);
for (const component of shimConfig.components) {
  define(component.moduleId, [`${shimLoaderPluginId}!${shimConfig.entryPath}`], (entry) => entry);
}
