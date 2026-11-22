interface TypeCheckOverlayConfig {
  origin: string;
  eventsUrl: string;
}

interface TypeCheckOverlayContent {
  title: string;
  text: string;
}

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

export function installTypeCheckOverlay(config: TypeCheckOverlayConfig): void {
  const installedKey = Symbol.for(`fast-serve.type-check-overlay:${config.origin}`);
  const pageGlobals = window as unknown as Record<symbol, boolean>;
  if (pageGlobals[installedKey] || typeof EventSource !== 'function') return;
  pageGlobals[installedKey] = true;

  let host: HTMLElement | undefined;
  let shownKey = '';
  let dismissedKey = '';

  const hide = (): void => {
    host?.remove();
    host = undefined;
    shownKey = '';
  };

  const dismiss = (): void => {
    dismissedKey = shownKey;
    hide();
  };

  const show = ({ title, text }: TypeCheckOverlayContent): void => {
    const key = `${title}\n${text}`;
    if (key === shownKey || key === dismissedKey) return;
    hide();
    dismissedKey = '';
    host = overlayElement('div', 'position:fixed;left:0;right:0;bottom:0;margin:0;padding:0;z-index:2147483646;');
    host.id = 'fast-serve-type-check-overlay';
    const root = host.attachShadow({ mode: 'open' });
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
      'Type errors don\'t stop hot updates. The panel closes when the type check is clean; Esc or × hides it until the errors change. Turn it off with "typeCheckOverlay": false in fast-serve/config.json.',
    );
    panel.append(close, heading, body, footer);
    root.append(panel);
    document.body.append(host);
    shownKey = key;
  };

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && host !== undefined) dismiss();
  });

  const events = new EventSource(config.eventsUrl);
  events.addEventListener('message', (event: MessageEvent<unknown>) => {
    const content = parseOverlayContent(event.data);
    if (content === undefined) {
      dismissedKey = '';
      hide();
      return;
    }
    show(content);
  });
}
