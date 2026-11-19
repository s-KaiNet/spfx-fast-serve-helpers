import vm from 'node:vm';

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  type: string;
  args?: unknown;
  initEvent(type: string): void;
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
}

export interface FakePageOptions {
  externals: Record<string, unknown>;
  fetch: (url: string) => Promise<Response>;
}

export interface FakePage {
  readonly globals: Record<string, unknown>;
  readonly head: FakeNode;
  readonly logs: string[];
  readonly reloads: () => number;
  loadAmdBundle(source: string): unknown;
  styles(): string[];
}

export function createFakePage({ externals, fetch }: FakePageOptions): FakePage {
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
    postMessage: () => undefined,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    queueMicrotask,
    fetch,
    WebSocket,
    URL,
  }) as unknown as Record<string, unknown>;
  globals.self = globals;
  globals.window = globals;
  const context = vm.createContext(globals);
  return {
    globals,
    head,
    logs,
    reloads: () => reloadCount,
    loadAmdBundle(source) {
      let factoryResult: unknown;
      const define = (dependencies: string[], factory: (...args: unknown[]) => unknown): void => {
        factoryResult = factory(...dependencies.map((name) => externals[name]));
      };
      globals.define = define;
      vm.runInContext(source, context);
      delete globals.define;
      if (factoryResult === undefined) throw new Error('the bundle did not call define()');
      return factoryResult;
    },
    styles: () => head.childNodes.filter((node) => node.tagName === 'style').map((node) => node.text),
  };
}
