import vm from 'node:vm';

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  type: string;
  args?: unknown;
  initEvent?(type: string): void;
  [key: string]: unknown;
}

class FakeEventTarget {
  private readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: FakeEvent): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) listener(event);
    return true;
  }
}

export class FakeNode extends FakeEventTarget {
  readonly childNodes: FakeNode[] = [];
  id = '';
  shadowRoot: FakeNode | undefined;
  readonly attributes = new Map<string, string>();
  parentNode: FakeNode | undefined;
  textContent = '';
  src = '';
  onload: ((event: { type: string; target: FakeNode }) => void) | null = null;
  onerror: ((event: { type: string; target: FakeNode }) => void) | null = null;

  constructor(
    readonly tagName: string,
    private readonly onAppend: (node: FakeNode) => void = () => undefined,
  ) {
    super();
  }

  get parentElement(): FakeNode | undefined {
    return this.parentNode;
  }

  get text(): string {
    return this.textContent + this.childNodes.map((child) => child.text).join('');
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  appendChild(child: FakeNode): FakeNode {
    child.parentNode = this;
    this.childNodes.push(child);
    this.onAppend(child);
    return child;
  }

  removeChild(child: FakeNode): FakeNode {
    const index = this.childNodes.indexOf(child);
    if (index !== -1) this.childNodes.splice(index, 1);
    child.parentNode = undefined;
    return child;
  }

  remove(): void {
    this.parentNode?.removeChild(this);
  }

  append(...children: FakeNode[]): void {
    for (const child of children) this.appendChild(child);
  }

  attachShadow(): FakeNode {
    this.shadowRoot = new FakeNode('#shadow-root');
    return this.shadowRoot;
  }
}

export interface FakePageOptions {
  externals: Record<string, unknown>;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
  webSocket?: typeof WebSocket;
}

export interface FakePage {
  readonly globals: Record<string, unknown>;
  readonly head: FakeNode;
  readonly body: FakeNode;
  readonly logs: string[];
  readonly reloads: () => number;
  loadAmdBundle(source: string, filename?: string): unknown;
  readonly window: unknown;
  evaluate(source: string, filename?: string): unknown;
  dispatch(type: string, properties?: Record<string, unknown>): void;
  styles(): string[];
}

export function createFakePage({ externals, fetch, webSocket = WebSocket }: FakePageOptions): FakePage {
  const logs: string[] = [];
  let reloadCount = 0;
  const loadScript = (script: FakeNode): void => {
    fetch(script.src)
      .then((response) => response.text())
      .then(
      (code) => {
        vm.runInContext(code, context, { filename: script.src });
        script.onload?.({ type: 'load', target: script });
      },
      () => script.onerror?.({ type: 'error', target: script }),
    );
  };
  const head = new FakeNode('head', (node) => {
    if (node.tagName === 'script') loadScript(node);
  });
  const body = new FakeNode('body');
  const document = Object.assign(new FakeEventTarget(), {
    head,
    body,
    readyState: 'complete',
    currentScript: null,
    createElement: (tagName: string) => new FakeNode(tagName.toLowerCase()),
    createTextNode: (text: string) => Object.assign(new FakeNode('#text'), { textContent: text }),
    createTreeWalker: (root: FakeNode) => {
      const texts: FakeNode[] = [];
      const collect = (node: FakeNode): void => {
        if (node.tagName === '#text') texts.push(node);
        node.childNodes.forEach(collect);
      };
      collect(root);
      let index = -1;
      return {
        nextNode: () => {
          index++;
          const text = texts[index];
          return text === undefined ? null : Object.defineProperty(text, 'nodeValue', { get: () => text.textContent, set: (value: string) => { text.textContent = value; }, configurable: true });
        },
      };
    },
    createEvent: (): FakeEvent => ({
      type: '',
      initEvent(type: string) {
        this.type = type;
      },
    }),
    getElementsByTagName: (tagName: string) => (tagName === 'head' ? [head] : tagName === 'body' ? [body] : []),
    querySelector: () => null,
    querySelectorAll: () => [],
  });
  const record = (level: string) => (...values: unknown[]) => logs.push(`${level}: ${values.map(String).join(' ')}`);
  const globals = Object.assign(new FakeEventTarget(), {
    console: { log: record('log'), info: record('info'), warn: record('warn'), error: record('error'), debug: record('debug'), trace: record('trace') },
    document,
    location: {
      href: 'https://contoso.sharepoint.com/sites/dev/SitePages/page.aspx',
      protocol: 'https:',
      host: 'contoso.sharepoint.com',
      hostname: 'contoso.sharepoint.com',
      port: '',
      pathname: '/sites/dev/SitePages/page.aspx',
      search: '',
      hash: '',
      reload: () => {
        reloadCount++;
      },
    },
    navigator: { userAgent: 'fake-page' },
    postMessage: (data: unknown) => {
      queueMicrotask(() => globals.dispatchEvent({ type: 'message', data, source: pageWindow }));
    },
    MutationObserver: class {
      observed = 0;
      observe(): void {
        this.observed++;
      }
      disconnect(): void {
        this.observed = 0;
      }
    },
    NodeFilter: { SHOW_TEXT: 4 },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    fetch,
    WebSocket: webSocket,
    URL,
  }) as unknown as Record<string, unknown> & FakeEventTarget;
  globals.self = globals;
  globals.window = globals;
  const context = vm.createContext(globals);
  const pageWindow: unknown = vm.runInContext('window', context);
  return {
    globals,
    head,
    body,
    logs,
    reloads: () => reloadCount,
    loadAmdBundle(source, filename) {
      let factoryResult: unknown;
      const define = (dependencies: string[], factory: (...args: unknown[]) => unknown): void => {
        factoryResult = factory(...dependencies.map((name) => externals[name]));
      };
      globals.define = define;
      vm.runInContext(source, context, filename === undefined ? {} : { filename });
      delete globals.define;
      if (factoryResult === undefined) throw new Error('the bundle did not call define()');
      return factoryResult;
    },
    window: pageWindow,
    evaluate: (source, filename) => vm.runInContext(source, context, filename === undefined ? {} : { filename }) as unknown,
    dispatch(type, properties = {}) {
      globals.dispatchEvent({ type, ...properties });
    },
    styles: () => head.childNodes.filter((node) => node.tagName === 'style').map((node) => node.text),
  };
}
