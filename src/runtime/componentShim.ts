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
const MISSING_EXPORT = /does not provide an export named '([^']+)'|import not found: ([\w$]+)/;
const STATUS_POLL_MS = 1000;
const UNREACHABLE_POLL_MAX_MS = 30_000;
const UNREACHABLE_GIVE_UP_MS = 10 * 60_000;

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
  let delay = STATUS_POLL_MS;
  let unreachableSince: number | undefined;
  let stopped = false;

  const schedule = () => setTimeout(() => void poll(), delay);
  const poll = async () => {
    const status = await fetchServerStatus();
    if (status) {
      if (unreachableSince !== undefined || status.fileRevision !== failedAtRevision) {
        location.reload();
        return;
      }
      delay = STATUS_POLL_MS;
    } else {
      unreachableSince ??= Date.now();
      if (Date.now() - unreachableSince >= UNREACHABLE_GIVE_UP_MS) {
        stopped = true;
        console.warn(`[fast-serve] ${shimConfig.origin} is not reachable: stopped waiting for file changes, polling resumes when this tab becomes visible again`);
        return;
      }
      delay = Math.min(delay * 2, UNREACHABLE_POLL_MAX_MS);
    }
    schedule();
  };

  document.addEventListener('visibilitychange', () => {
    if (!stopped || document.visibilityState !== 'visible') return;
    stopped = false;
    unreachableSince = Date.now();
    delay = STATUS_POLL_MS;
    void poll();
  });
  schedule();
}

function formatServerError(serverError: ShimLastServerError): string {
  const where = serverError.location === undefined ? '' : ` in ${serverError.location}`;
  return `${serverError.message}${where}. See the fast-serve terminal for details`;
}

const FAST_SERVE_PREFIX = '[fast-serve] ';
const REPORTED_IN_TERMINAL = Symbol.for('fast-serve.reported-in-terminal');

function missingExportHint(name: string): string {
  return (
    `. "${name}" has no runtime value in that module: it is probably a TypeScript-only declaration imported without \`type\` ` +
    '(an interface, a type, or a `const enum` that only exists in .d.ts files, which heft inlines but fast-serve compiles file by file). ' +
    `Use \`import type { ${name} }\` for types; for a \`const enum\` from a dependency use its literal values, or declare a regular \`enum\` in your own code`
  );
}

async function toBundleLoadError(error: unknown): Promise<Error> {
  let reason = describeError(error);
  if (reason.startsWith(FAST_SERVE_PREFIX)) reason = reason.slice(FAST_SERVE_PREFIX.length);
  const status = await fetchServerStatus();
  const serverError = MODULE_FETCH_FAILURE.test(reason) ? status?.error : undefined;
  if (MODULE_FETCH_FAILURE.test(reason)) {
    reason = serverError
      ? formatServerError(serverError)
      : `${reason}. A module failed to compile (syntax or transform error) or the dev server is not reachable: check the fast-serve terminal`;
  }
  const missingExport = MISSING_EXPORT.exec(reason);
  if (missingExport) reason += missingExportHint(missingExport[1] ?? missingExport[2] ?? '');
  if (status) {
    reloadAfterNextFileChange(status.fileRevision);
    reason += ' (the page reloads after the next file change)';
  }
  const bundleError = new Error(`[fast-serve] Failed to load bundle "${shimConfig.bundleName}" from ${shimConfig.origin}: ${reason}`, { cause: error });
  if (serverError) Object.defineProperty(bundleError, REPORTED_IN_TERMINAL, { value: true });
  return bundleError;
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
    const browserErrorsForwarding = import(shimConfig.origin + shimConfig.browserErrorsPath).catch(() => undefined);
    import(shimConfig.origin + entryPath).then(onload, async (error: unknown) => {
      const bundleError = await toBundleLoadError(error);
      await browserErrorsForwarding;
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
