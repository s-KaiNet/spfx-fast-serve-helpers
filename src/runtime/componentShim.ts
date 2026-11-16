type BundleShimConfig = import('./contracts.js').BundleShimConfig;
type ShimFastServeGlobal = import('./contracts.js').FastServeGlobal;
type ShimScopedRequire = import('./contracts.js').ScopedRequire;

interface RequireJsLoadCallback {
  (value: unknown): void;
  error(error: unknown): void;
}
interface RequireJsLoaderPlugin {
  load(name: string, scopedRequire: ShimScopedRequire, onload: RequireJsLoadCallback): void;
}

declare const __SPFX_BUNDLE__: BundleShimConfig;
declare function define(id: string, dependencies: string[], factory: (...modules: unknown[]) => unknown): void;

const shimConfig = __SPFX_BUNDLE__;
const shimLoaderPluginId = `spfx-fast-serve-loader:${shimConfig.bundleName}`;
const shimHost = window as unknown as { __spfxFastServe: ShimFastServeGlobal };

function toBundleLoadError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`[fast-serve] Failed to load bundle "${shimConfig.bundleName}" from ${shimConfig.origin}: ${message}`, {
    cause: error,
  });
}

const SHAREPOINT_UNREADABLE_ERROR = '[object Object]';
const ERROR_REVEAL_WINDOW_MS = 60_000;

function revealErrorInWebPartErrorBoxes(message: string): void {
  const errorBoxes = shimConfig.components
    .map((component) => `[data-sp-web-part-id="${component.id}"] [data-automation-id="webPartError"]`)
    .join(',');
  const replaceUnreadableErrors = () => {
    for (const errorBox of document.querySelectorAll(errorBoxes)) {
      const texts = document.createTreeWalker(errorBox, NodeFilter.SHOW_TEXT);
      for (let text = texts.nextNode(); text; text = texts.nextNode()) {
        if (text.nodeValue?.includes(SHAREPOINT_UNREADABLE_ERROR)) text.nodeValue = text.nodeValue.replace(SHAREPOINT_UNREADABLE_ERROR, message);
      }
    }
  };
  const observer = new MutationObserver(replaceUnreadableErrors);
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  setTimeout(() => {
    observer.disconnect();
  }, ERROR_REVEAL_WINDOW_MS);
}

const shimLoaderPlugin: RequireJsLoaderPlugin = {
  load(entryPath, scopedRequire, onload) {
    shimHost.__spfxFastServe.useScopedRequire(scopedRequire);
    import(shimConfig.origin + entryPath).then(onload, (error: unknown) => {
      const bundleError = toBundleLoadError(error);
      console.error(bundleError);
      revealErrorInWebPartErrorBoxes(bundleError.message);
      onload.error(bundleError);
    });
  },
};

define(shimLoaderPluginId, [], () => shimLoaderPlugin);
for (const component of shimConfig.components) {
  define(component.moduleId, [`${shimLoaderPluginId}!${shimConfig.entryPath}`], (entry) => entry);
}
