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

type ShimLastServerError = import('./contracts.js').LastServerError;
type ShimServerStatus = import('./contracts.js').ServerStatus;

const MODULE_FETCH_FAILURE = /dynamically imported module|importing a module script failed|error loading dynamically imported module/i;
const STATUS_POLL_MS = 1000;

function describeShimError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'object' && error !== null) {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string') return message;
    try {
      return JSON.stringify(error);
    } catch {
      return Object.prototype.toString.call(error);
    }
  }
  return String(error);
}

async function fetchServerStatus(): Promise<ShimServerStatus | undefined> {
  try {
    const response = await fetch(shimConfig.origin + shimConfig.statusPath, { cache: 'no-store' });
    return response.ok ? ((await response.json()) as ShimServerStatus) : undefined;
  } catch {
    return undefined;
  }
}

let reloadScheduled = false;

function reloadAfterNextFileChange(failedAtRevision: number): void {
  if (reloadScheduled) return;
  reloadScheduled = true;
  const poll = async () => {
    const status = await fetchServerStatus();
    if (status && status.fileRevision !== failedAtRevision) location.reload();
    else setTimeout(() => void poll(), STATUS_POLL_MS);
  };
  setTimeout(() => void poll(), STATUS_POLL_MS);
}

function formatServerError(serverError: ShimLastServerError): string {
  const where = serverError.location === undefined ? '' : ` in ${serverError.location}`;
  return `${serverError.message}${where}. See the fast-serve terminal for details`;
}

const FAST_SERVE_PREFIX = '[fast-serve] ';

async function toBundleLoadError(error: unknown): Promise<Error> {
  let reason = describeShimError(error);
  if (reason.startsWith(FAST_SERVE_PREFIX)) reason = reason.slice(FAST_SERVE_PREFIX.length);
  const status = await fetchServerStatus();
  if (MODULE_FETCH_FAILURE.test(reason)) {
    reason = status?.error
      ? formatServerError(status.error)
      : `${reason}. A module failed to compile (syntax or transform error) or the dev server is not reachable: check the fast-serve terminal`;
  }
  if (status) {
    reloadAfterNextFileChange(status.fileRevision);
    reason += ' (the page reloads after the next file change)';
  }
  return new Error(`[fast-serve] Failed to load bundle "${shimConfig.bundleName}" from ${shimConfig.origin}: ${reason}`, { cause: error });
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
    import(shimConfig.origin + entryPath).then(onload, async (error: unknown) => {
      const bundleError = await toBundleLoadError(error);
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
