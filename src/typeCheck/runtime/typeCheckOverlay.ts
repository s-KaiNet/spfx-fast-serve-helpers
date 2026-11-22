interface TypeCheckOverlayConfig {
  origin: string;
  eventsUrl: string;
}

interface TypeCheckOverlayContent {
  title: string;
  text: string;
}

type PanelMode = 'hidden' | 'full' | 'bar';

const ERROR_OVERLAY_ID = 'fast-serve-error-overlay';
const ERROR_OVERLAY_CHANGED_EVENT = 'fast-serve:error-overlay-changed';
const PANEL_ID = 'fast-serve-type-check-overlay';

function overlayElement<K extends keyof HTMLElementTagNameMap>(tag: K, style: string, text = ''): HTMLElementTagNameMap[K] {
  const created = document.createElement(tag);
  created.setAttribute('style', style);
  created.textContent = text;
  return created;
}

function parseOverlayContent(data: unknown): TypeCheckOverlayContent | undefined {
  if (typeof data !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(data);
    if (typeof parsed !== 'object' || parsed === null) return undefined;
    const { title, text } = parsed as { title?: unknown; text?: unknown };
    return typeof title === 'string' && typeof text === 'string' ? { title, text } : undefined;
  } catch {
    return undefined;
  }
}

function openErrorOverlay(): HTMLElement | undefined {
  return document.getElementById(ERROR_OVERLAY_ID) ?? undefined;
}

export function installTypeCheckOverlay(config: TypeCheckOverlayConfig): void {
  const installedKey = Symbol.for(`fast-serve.type-check-overlay:${config.origin}`);
  const pageGlobals = window as unknown as Record<symbol, boolean>;
  if (pageGlobals[installedKey] || typeof EventSource !== 'function') return;
  pageGlobals[installedKey] = true;

  let content: TypeCheckOverlayContent | undefined;
  let dismissedKey = '';
  let expandedOver: HTMLElement | undefined;
  let host: HTMLElement | undefined;
  let shownMode: PanelMode = 'hidden';
  let shownKey = '';
  let shownOver: HTMLElement | undefined;
  let renderScheduled = false;

  const contentKey = (shown: TypeCheckOverlayContent): string => `${shown.title}\n${shown.text}`;

  const removePanel = (): void => {
    host?.remove();
    host = undefined;
    shownMode = 'hidden';
    shownKey = '';
    shownOver = undefined;
  };

  const fullPanel = ({ title, text }: TypeCheckOverlayContent): HTMLElement => {
    const panel = overlayElement(
      'div',
      'max-height:45vh;overflow:auto;padding:16px 24px;background:#181818;border-top:4px solid #e8a33b;box-shadow:0 -8px 32px rgba(0,0,0,0.5);font:13px/1.5 Menlo,Consolas,monospace;color:#e8e8e8;',
    );
    const close = overlayElement('button', 'position:absolute;top:6px;right:12px;background:none;border:none;color:#e8e8e8;font-size:22px;cursor:pointer;', '×');
    close.setAttribute('aria-label', 'Close');
    close.addEventListener('click', dismiss);
    const heading = overlayElement('div', 'color:#f0b45a;font:600 16px/1.4 Segoe UI,sans-serif;margin-bottom:12px;', `[fast-serve] ${title}`);
    const body = overlayElement('pre', 'margin:0;white-space:pre-wrap;word-break:break-word;', text);
    const footer = overlayElement(
      'div',
      'margin-top:12px;color:#9a9a9a;font:12px/1.4 Segoe UI,sans-serif;',
      'Type errors don\'t stop hot updates. The panel closes when the type check is clean; Esc or × hides it until the errors change. Turn it off with --no-type-check-overlay or "typeCheckOverlay": false in fast-serve/config.json.',
    );
    panel.append(close, heading, body, footer);
    return panel;
  };

  const collapsedBar = ({ title }: TypeCheckOverlayContent): HTMLElement => {
    const bar = overlayElement(
      'div',
      'padding:6px 24px;background:#181818;border-top:3px solid #e8a33b;box-shadow:0 -4px 16px rgba(0,0,0,0.5);color:#f0b45a;font:600 13px/1.4 Segoe UI,sans-serif;cursor:pointer;',
      `[fast-serve] ${title} (also shown in the terminal) - click to show`,
    );
    bar.setAttribute('role', 'button');
    bar.setAttribute('title', 'Show the type errors');
    bar.addEventListener('click', () => {
      expandedOver = shownOver;
      render();
    });
    return bar;
  };

  const showPanel = (mode: 'full' | 'bar', shown: TypeCheckOverlayContent, over: HTMLElement | undefined): void => {
    const key = contentKey(shown);
    if (mode === shownMode && key === shownKey && over === shownOver) return;
    removePanel();
    host = overlayElement('div', 'position:fixed;left:0;right:0;bottom:0;margin:0;padding:0;z-index:2147483647;');
    host.id = PANEL_ID;
    host.setAttribute('data-mode', mode);
    host.attachShadow({ mode: 'open' }).append(mode === 'full' ? fullPanel(shown) : collapsedBar(shown));
    document.body.append(host);
    shownMode = mode;
    shownKey = key;
    shownOver = over;
  };

  function render(): void {
    const over = openErrorOverlay();
    if (expandedOver !== over) expandedOver = undefined;
    if (content === undefined || contentKey(content) === dismissedKey) {
      removePanel();
      return;
    }
    showPanel(over === undefined || expandedOver === over ? 'full' : 'bar', content, over);
  }

  function dismiss(): void {
    if (content !== undefined) dismissedKey = contentKey(content);
    removePanel();
  }

  window.addEventListener(
    'keydown',
    (event) => {
      if (event.key === 'Escape' && shownMode === 'full' && shownOver === undefined && openErrorOverlay() === undefined) dismiss();
    },
    { capture: true },
  );

  window.addEventListener(ERROR_OVERLAY_CHANGED_EVENT, () => {
    if (renderScheduled) return;
    renderScheduled = true;
    queueMicrotask(() => {
      renderScheduled = false;
      render();
    });
  });

  const events = new EventSource(config.eventsUrl);
  events.addEventListener('message', (event: MessageEvent<unknown>) => {
    const next = parseOverlayContent(event.data);
    if (next === undefined || contentKey(next) !== dismissedKey) dismissedKey = '';
    content = next;
    render();
  });
}
