import type { BrowserErrorKind, BrowserErrorReport, BrowserErrorResponse, OverlayContent, PageRuntimeConfig } from '../contracts.js';

interface ErrorDetails {
  name: string;
  message: string;
  stack: string;
}

interface RequireJsError {
  requireType?: unknown;
  requireModules?: unknown;
}

type OverlaySource = 'compile' | 'runtime';

interface FastServeOverlay {
  show(source: OverlaySource, content: OverlayContent): void;
  hide(source: OverlaySource): void;
}

const HOT_UPDATE_APPLYING_BUNDLES = Symbol.for('fast-serve.hot-update.applying-bundles');

const DEV_TOOLING_PREFIXES = ['[rspack-dev-server]', '[HMR]', '[fast-serve]'];

const DEV_SERVER_MESSAGES = ['webpackErrors', 'webpackWarnings', 'webpackInvalid', 'webpackOk', 'webpackStillOk'] as const;

interface DevServerMessage {
  type: (typeof DEV_SERVER_MESSAGES)[number];
  data?: unknown;
}

function describeValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return Object.prototype.toString.call(value);
    }
  }
  return String(value);
}

function errorDetails(value: unknown): ErrorDetails {
  if (typeof value === 'object' && value !== null) {
    const { name, message, stack } = value as { name?: unknown; message?: unknown; stack?: unknown };
    if (typeof message === 'string') return { name: typeof name === 'string' ? name : 'Error', message, stack: typeof stack === 'string' ? stack : '' };
  }
  return { name: 'Error', message: describeValue(value), stack: '' };
}

function isDevToolingMessage(args: readonly unknown[]): boolean {
  const [first] = args;
  return typeof first === 'string' && DEV_TOOLING_PREFIXES.some((prefix) => first.startsWith(prefix));
}

function isApplyingHotUpdate(): boolean {
  const applyingBundles = (window as unknown as Record<symbol, Set<unknown> | undefined>)[HOT_UPDATE_APPLYING_BUNDLES];
  return applyingBundles !== undefined && applyingBundles.size > 0;
}

function isDevServerMessage(data: unknown): data is DevServerMessage {
  if (typeof data !== 'object' || data === null) return false;
  const { type } = data as { type?: unknown };
  return DEV_SERVER_MESSAGES.some((known) => known === type);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text = ''): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.setAttribute('style', style);
  created.textContent = text;
  return created;
}

function createOverlay(): FastServeOverlay {
  let host: HTMLElement | undefined;
  let shownSource: OverlaySource | undefined;
  let shownText = '';
  const hide = (): void => {
    host?.remove();
    host = undefined;
    shownSource = undefined;
    shownText = '';
  };
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hide();
  });
  return {
    show(source, { title, text }) {
      if (source === 'runtime' && shownSource === 'compile') return;
      if (source === shownSource && `${title}\n${text}` === shownText) return;
      hide();
      host = element('div', 'position:fixed;top:0;left:0;width:100vw;height:100vh;margin:0;padding:0;z-index:2147483647;');
      host.id = 'fast-serve-error-overlay';
      const root = host.attachShadow({ mode: 'open' });
      const backdrop = element('div', 'position:absolute;top:0;left:0;right:0;bottom:0;overflow:auto;background:rgba(0,0,0,0.85);font:14px/1.5 Menlo,Consolas,monospace;color:#e8e8e8;');
      const panel = element('div', 'position:relative;max-width:1100px;margin:48px auto;padding:24px 28px;background:#181818;border-top:6px solid #e83b46;box-shadow:0 8px 32px rgba(0,0,0,0.5);');
      const close = element('button', 'position:absolute;top:8px;right:12px;background:none;border:none;color:#e8e8e8;font-size:24px;cursor:pointer;', '×');
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', hide);
      const heading = element('div', 'color:#ff6b6b;font:600 18px/1.4 Segoe UI,sans-serif;margin-bottom:16px;', `[fast-serve] ${title}`);
      const body = element('pre', 'margin:0;white-space:pre-wrap;word-break:break-word;', text);
      const footer = element(
        'div',
        'margin-top:20px;color:#9a9a9a;font:13px/1.4 Segoe UI,sans-serif;',
        source === 'compile'
          ? 'Fix the error and save: the overlay closes after the rebuild. Esc or × closes it. Turn it off with --no-overlay or "overlay": false in fast-serve/config.json.'
          : 'The error is also printed in the fast-serve terminal. The overlay closes after the next successful update and opens again if the error repeats. Esc or × closes it. Turn it off with --no-overlay or "overlay": false in fast-serve/config.json.',
      );
      panel.append(close, heading, body, footer);
      backdrop.append(panel);
      backdrop.addEventListener('click', (event) => {
        if (event.target === backdrop) hide();
      });
      root.append(backdrop);
      document.body.append(host);
      shownSource = source;
      shownText = `${title}\n${text}`;
    },
    hide(source) {
      if (shownSource === source) hide();
    },
  };
}

export function installFastServePage(config: PageRuntimeConfig): void {
  const installedKey = Symbol.for(`fast-serve.page:${config.origin}`);
  const pageGlobals = window as unknown as Record<symbol, boolean>;
  if (pageGlobals[installedKey]) return;
  pageGlobals[installedKey] = true;

  const MAX_MESSAGE_LENGTH = 4000;
  const UNREADABLE_ERROR = '[object Object]';
  const REVEAL_WINDOW_MS = 60_000;
  const WARNINGS_SETTLE_MS = 100;
  const LOAD_FAILURE = /Could not load (\S+) in require/;
  const forwardedErrors = new WeakSet();
  const overlay = createOverlay();
  let failedBundles = false;
  let rebuiltAfterFailure = false;
  let rebuilding = false;
  let updateGeneration = 0;
  let pendingReload: ReturnType<typeof setTimeout> | undefined;

  function claimError(value: unknown): boolean {
    if (typeof value !== 'object' || value === null) return true;
    if (forwardedErrors.has(value)) return false;
    forwardedErrors.add(value);
    return true;
  }

  function mentionsServedCode(...texts: string[]): boolean {
    return texts.some((text) => text.includes(config.distUrl));
  }

  function send(sent: BrowserErrorReport): void {
    const sentInGeneration = updateGeneration;
    const body = JSON.stringify({ ...sent, message: sent.message.slice(0, MAX_MESSAGE_LENGTH) });
    fetch(config.reportUrl, { method: 'POST', mode: 'cors', credentials: 'omit', headers: { 'Content-Type': 'text/plain' }, body })
      .then((response) => (response.ok ? (response.json() as Promise<BrowserErrorResponse>) : {}))
      .then(({ overlay: overlayContent, pageMessage }: BrowserErrorResponse) => {
        if (overlayContent && config.overlay && sentInGeneration === updateGeneration) overlay.show('runtime', overlayContent);
        if (pageMessage && sent.bundle !== undefined) revealInErrorBoxes(sent.bundle, pageMessage);
      })
      .catch(() => undefined);
  }

  function forward(kind: BrowserErrorKind, value: unknown, details: ErrorDetails, callStack = ''): void {
    if (!mentionsServedCode(details.stack, callStack) || !claimError(value)) return;
    send({ kind, ...details, callStack });
  }

  function loadFailure(args: readonly unknown[]): BrowserErrorReport | undefined {
    const failure = args.find((arg): arg is RequireJsError => typeof arg === 'object' && arg !== null && 'requireType' in arg);
    if (failure === undefined) return undefined;
    const modules = Array.isArray(failure.requireModules) ? failure.requireModules.filter((name): name is string => typeof name === 'string') : [];
    const named = args.map((arg) => (typeof arg === 'string' ? LOAD_FAILURE.exec(arg)?.[1] : undefined)).find((name) => name !== undefined);
    const bundle = [named, ...modules].find((name): name is string => name !== undefined && name in config.bundles);
    if (bundle === undefined) return undefined;
    const details = errorDetails(failure);
    return { kind: 'load-error', ...details, callStack: '', bundle, requireType: String(failure.requireType), requireModules: modules };
  }

  function revealInErrorBoxes(bundle: string, message: string): void {
    const selector = (config.bundles[bundle] ?? []).map((id) => `[data-sp-web-part-id="${id}"] [data-automation-id="webPartError"]`).join(',');
    if (selector === '') return;
    const replaceUnreadable = (): void => {
      for (const errorBox of document.querySelectorAll(selector)) {
        const texts = document.createTreeWalker(errorBox, NodeFilter.SHOW_TEXT);
        for (let text = texts.nextNode(); text; text = texts.nextNode()) {
          if (text.nodeValue?.includes(UNREADABLE_ERROR)) text.nodeValue = text.nodeValue.replace(UNREADABLE_ERROR, message);
        }
      }
    };
    replaceUnreadable();
    const observer = new MutationObserver(replaceUnreadable);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    setTimeout(() => {
      observer.disconnect();
    }, REVEAL_WINDOW_MS);
  }

  function showCompileErrors(data: unknown): void {
    const errors = Array.isArray(data) ? data.filter((error): error is string => typeof error === 'string') : [];
    if (config.overlay && errors.length > 0) overlay.show('compile', { title: errors.length === 1 ? 'Compile error' : `Compile errors (${errors.length})`, text: errors.join('\n\n') });
  }

  function finishUpdate(): void {
    overlay.hide('compile');
    if (rebuilding) {
      updateGeneration += 1;
      overlay.hide('runtime');
    }
    rebuilding = false;
  }

  function reloadAfterFailureFix(): void {
    if (rebuiltAfterFailure) window.location.reload();
  }

  function cancelPendingReload(): void {
    clearTimeout(pendingReload);
    pendingReload = undefined;
  }

  function onDevServerMessage({ type, data }: DevServerMessage): void {
    if (type === 'webpackWarnings') {
      finishUpdate();
      if (rebuiltAfterFailure) pendingReload ??= setTimeout(reloadAfterFailureFix, WARNINGS_SETTLE_MS);
      return;
    }
    cancelPendingReload();
    if (type === 'webpackErrors') {
      rebuilding = false;
      showCompileErrors(data);
      return;
    }
    if (type === 'webpackInvalid') {
      overlay.hide('compile');
      rebuilding = true;
      if (failedBundles) rebuiltAfterFailure = true;
      return;
    }
    if (type === 'webpackStillOk') {
      overlay.hide('compile');
      rebuilding = false;
      return;
    }
    finishUpdate();
    reloadAfterFailureFix();
  }

  window.addEventListener('message', (event) => {
    if (event.source === window && isDevServerMessage(event.data)) onDevServerMessage(event.data);
  });

  window.addEventListener('error', (event) => {
    if (event.error !== undefined && event.error !== null) {
      forward('error', event.error, errorDetails(event.error));
      return;
    }
    const location = event.filename ? `    at ${event.filename}:${event.lineno}:${event.colno}` : '';
    forward('error', undefined, { name: 'Error', message: event.message, stack: location });
  });

  window.addEventListener('unhandledrejection', (event) => {
    forward('unhandled-rejection', event.reason, errorDetails(event.reason));
  });

  const consoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    consoleError(...args);
    const failure = loadFailure(args);
    if (failure !== undefined) {
      failedBundles = true;
      const failureObject = args.find((arg) => typeof arg === 'object' && arg !== null);
      if (claimError(failureObject)) send(failure);
      return;
    }
    if (isDevToolingMessage(args)) return;
    const loggedError = args.find((arg) => arg instanceof Error);
    if (loggedError !== undefined && isApplyingHotUpdate()) {
      forward('hot-update-error', loggedError, errorDetails(loggedError));
      return;
    }
    const message = args.map(describeValue).join(' ');
    forward('console-error', loggedError, { name: 'console.error', message, stack: loggedError?.stack ?? '' }, new Error('console.error call site').stack ?? '');
  };
}
